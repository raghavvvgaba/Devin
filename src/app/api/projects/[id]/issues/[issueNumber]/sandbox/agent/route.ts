import { NextResponse } from "next/server";

import { DEFAULT_AGENT_MODEL, isAgentModelId } from "~/lib/agent-models";
import {
  completeAgentRun,
  createAgentRun,
  createAgentTraceWriter,
  failAgentRun,
} from "~/server/agent-activity";
import {
  appendIssueChatMessages,
  getIssueChatMessages,
  getOrCreateIssueChatSession,
  toSandboxAgentConversationHistory,
} from "~/server/chat";
import { revalidateProjectGitHubReads } from "~/server/github/cache";
import { fetchProjectIssue } from "~/server/github/issues";
import { runSandboxAgent } from "~/server/sandbox/agent";
import { parseSandboxAgentMode } from "~/server/sandbox/agent-mode";
import { formatSseEvent } from "~/server/sandbox/agent-stream";
import { toTracePreview } from "~/server/sandbox/agent-trace";
import {
  getOwnedIssueProject,
  readJsonObject,
  readStringField,
  verifyIssueSandboxAccess,
  type IssueSandboxRouteContext,
} from "~/server/sandbox/route-helpers";

export const runtime = "nodejs";
export const maxDuration = 120;

function jsonFailure(message: string, status: number) {
  return NextResponse.json(
    {
      message,
      status: "failed" as const,
    },
    { status },
  );
}

function mapOwnershipFailure(status: number) {
  if (status === 401) {
    return jsonFailure("Sign in to continue using the sandbox agent.", 401);
  }

  return jsonFailure("This project could not be found.", 404);
}

function mapIssueFailure(status: Awaited<ReturnType<typeof fetchProjectIssue>>["status"]) {
  switch (status) {
    case "missing_access":
      return jsonFailure(
        "GitHub access for this repository is missing or expired.",
        403,
      );
    case "not_found":
      return jsonFailure("This issue could not be found.", 404);
    default:
      return jsonFailure("The issue details could not be loaded right now.", 400);
  }
}

function buildAgentSummary(result: Awaited<ReturnType<typeof runSandboxAgent>>) {
  const clarification = result.clarificationQuestion
    ? `\n\nClarification needed: ${result.clarificationQuestion}`
    : "";

  switch (result.status) {
    case "completed":
      return {
        body: result.message,
        tone: "success" as const,
      };
    case "blocked":
      return {
        body: `${result.message}${clarification}`,
        tone: result.failureCode ? ("error" as const) : ("warning" as const),
      };
    default:
      return {
        body: result.message,
        tone: "error" as const,
      };
  }
}

function createAgentStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
  });

  function send(event: Parameters<typeof formatSseEvent>[0]) {
    controller?.enqueue(encoder.encode(formatSseEvent(event)));
  }

  function close() {
    controller?.close();
  }

  return {
    close,
    send,
    stream,
  };
}

async function persistAgentChatMessages(input: {
  chatSessionId: string;
  result: Awaited<ReturnType<typeof runSandboxAgent>>;
  userInstruction: string;
}) {
  const summary = buildAgentSummary(input.result);

  return appendIssueChatMessages(input.chatSessionId, [
    {
      body: input.userInstruction,
      role: "user",
    },
    {
      body: summary.body,
      role: "assistant",
      tone: summary.tone,
    },
  ]);
}

export async function POST(
  request: Request,
  context: IssueSandboxRouteContext,
) {
  const access = await getOwnedIssueProject(request, context);

  if ("response" in access) {
    const routeResponse = access.response!;
    return mapOwnershipFailure(routeResponse.status);
  }

  const body = await readJsonObject(request);
  const sessionId = readStringField(body, "sessionId");
  const instruction = readStringField(body, "instruction");
  const mode = parseSandboxAgentMode(body?.mode);
  const requestedModel = readStringField(body, "model");
  const model = isAgentModelId(requestedModel)
    ? requestedModel
    : DEFAULT_AGENT_MODEL;

  if (!mode) {
    return jsonFailure("Choose either Plan or Build mode.", 400);
  }

  if (!sessionId) {
    return jsonFailure("Start the sandbox first so Inlaya has a live workspace.", 400);
  }

  if (
    !(await verifyIssueSandboxAccess({
      projectId: access.project.id,
      sessionId,
      userId: access.userId,
    }))
  ) {
    return jsonFailure(
      "This sandbox session is no longer available. Start a fresh sandbox and try again.",
      404,
    );
  }

  if (!instruction) {
    return jsonFailure("Add an instruction before starting the sandbox agent.", 400);
  }

  const issueResult = await fetchProjectIssue(
    access.project.repoOwner,
    access.project.repoName,
    access.issueNumber,
  );

  if (issueResult.status !== "ok") {
    return mapIssueFailure(issueResult.status);
  }

  const agentStream = createAgentStream();

  void (async () => {
    const runStartedAt = Date.now();
    let agentRunId: string | undefined;
    let traceWriter: ReturnType<typeof createAgentTraceWriter> | undefined;

    try {
      const chatSession = await getOrCreateIssueChatSession({
        issueNumber: access.issueNumber,
        projectId: access.project.id,
        title: issueResult.issue.title,
        userId: access.userId,
      });

      try {
        const agentRun = await createAgentRun({
          chatSessionId: chatSession.id,
          instructionPreview: toTracePreview(instruction, 240),
          issueNumber: access.issueNumber,
          issueTitle: issueResult.issue.title,
          mode,
          projectId: access.project.id,
          provider: "openrouter",
          requestedModel: model,
          userId: access.userId,
        });
        agentRunId = agentRun.id;
        traceWriter = createAgentTraceWriter(agentRun.id);
      } catch (error) {
        console.error("Sandbox agent activity run creation failed:", error);
      }

      const conversationHistory = toSandboxAgentConversationHistory(
        await getIssueChatMessages(chatSession.id),
      );
      const result = await runSandboxAgent(
        {
          conversationHistory,
          conversationSessionId: chatSession.id,
          issueNumber: access.issueNumber,
          issueTitle: issueResult.issue.title,
          mode,
          model,
          projectId: access.project.id,
          repoName: access.project.repoName,
          repoOwner: access.project.repoOwner,
          sessionId,
          userInstruction: instruction,
        },
        {
          onFinalTextDelta(delta) {
            agentStream.send({ delta, type: "final_delta" });
          },
          onProgress(event) {
            agentStream.send(event);
          },
          onTrace(event) {
            traceWriter?.append(event);
          },
        },
      );

      if (result.usage) {
        console.log("Sandbox agent usage:", {
          issueNumber: access.issueNumber,
          mode,
          projectId: access.project.id,
          status: result.status,
          usage: result.usage,
        });
      }

      if (traceWriter && agentRunId) {
        traceWriter.append({
          level: result.status === "failed" ? "error" : "info",
          model: traceWriter.getResolvedModel(),
          paths: result.filesTouched,
          payload: {
            filesTouched: result.filesTouched,
            messagePreview: toTracePreview(result.message, 220),
          },
          status: result.status,
          step: result.stepsUsed,
          type: result.status === "failed" ? "run_failed" : "run_completed",
          usage: result.usage,
        });
        await traceWriter.flush();

        try {
          await completeAgentRun({
            durationMs: Date.now() - runStartedAt,
            failureCode: result.failureCode,
            resolvedModel: traceWriter.getResolvedModel(),
            runId: agentRunId,
            status: result.status,
            stepsUsed: result.stepsUsed,
            usage: result.usage,
          });
        } catch (error) {
          console.error("Sandbox agent activity completion failed:", error);
        }
      }

      let chatMessages:
        | Awaited<ReturnType<typeof appendIssueChatMessages>>
        | undefined;

      if (result.status !== "failed") {
        try {
          chatMessages = await persistAgentChatMessages({
            chatSessionId: chatSession.id,
            result,
            userInstruction: instruction,
          });
        } catch (error) {
          console.error("Sandbox agent chat persistence failed:", error);
          traceWriter?.append({
            level: "warn",
            payload: {
              message: "The completed chat messages could not be persisted.",
            },
            status: "failed",
            type: "persistence_error",
          });
        }
      }

      revalidateProjectGitHubReads({
        issueNumber: access.issueNumber,
        repoName: access.project.repoName,
        repoOwner: access.project.repoOwner,
      });

      const { failureCode: _failureCode, ...publicResult } = result;

      if (result.status === "failed") {
        agentStream.send({
          message: result.message,
          type: "error",
        });
        return;
      }

      agentStream.send({
        result: {
          ...publicResult,
          ...(chatMessages ? { messages: chatMessages } : {}),
        },
        type: "final",
      });
    } catch (error) {
      console.error("Sandbox agent stream failed:", error);

      if (traceWriter && agentRunId) {
        traceWriter.append({
          level: "error",
          payload: {
            message: "The sandbox agent stream failed unexpectedly.",
          },
          status: "failed",
          type: "run_failed",
        });
        await traceWriter.flush();

        try {
          await failAgentRun({
            durationMs: Date.now() - runStartedAt,
            failureCode: "stream_error",
            runId: agentRunId,
          });
        } catch (persistenceError) {
          console.error(
            "Sandbox agent activity failure persistence failed:",
            persistenceError,
          );
        }
      }

      agentStream.send({
        message: "The sandbox agent could not finish this request.",
        type: "error",
      });
    } finally {
      await traceWriter?.flush();
      agentStream.close();
    }
  })();

  return new Response(agentStream.stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}
