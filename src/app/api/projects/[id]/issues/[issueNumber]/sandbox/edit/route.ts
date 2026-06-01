import { NextResponse } from "next/server";

import {
  appendIssueChatMessages,
  getOrCreateIssueChatSession,
} from "~/server/chat";
import { revalidateProjectGitHubReads } from "~/server/github/cache";
import { fetchProjectIssue } from "~/server/github/issues";
import {
  getOwnedIssueProject,
  readJsonObject,
  readStringField,
  type IssueSandboxRouteContext,
  verifyIssueSandboxAccess,
} from "~/server/sandbox/route-helpers";
import { prepareSandboxSingleFileAiEdit } from "~/server/sandbox/ai-edit";

export const runtime = "nodejs";
export const maxDuration = 120;

function wantsJson(request: Request) {
  const accept = request.headers.get("accept") ?? "";
  const contentType = request.headers.get("content-type") ?? "";

  return (
    accept.includes("application/json") ||
    contentType.includes("application/json")
  );
}

function redirectToIssueWithStatus(
  request: Request,
  projectId: string,
  issueNumber: number,
  key: "error" | "success",
  value: string,
) {
  const redirectUrl = new URL(
    `/projects/${projectId}/issues/${issueNumber}`,
    request.url,
  );
  redirectUrl.searchParams.set(key, value);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}

function jsonError(code: string, status = 400) {
  return NextResponse.json(
    {
      code,
      status: "error" as const,
    },
    { status },
  );
}

async function getRequestedEditInput(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await readJsonObject(request);

    return {
      filePath: readStringField(body, "filePath"),
      instruction: readStringField(body, "instruction"),
      sessionId: readStringField(body, "sessionId"),
    };
  }

  const formData = await request.formData();
  const filePath = formData.get("filePath");
  const instruction = formData.get("instruction");
  const sessionId = formData.get("sessionId");

  return {
    filePath: typeof filePath === "string" ? filePath.trim() : null,
    instruction: typeof instruction === "string" ? instruction.trim() : null,
    sessionId: typeof sessionId === "string" ? sessionId.trim() : null,
  };
}

function mapPreparedEditFailure(
  status: Exclude<Awaited<ReturnType<typeof prepareSandboxSingleFileAiEdit>>["status"], "ok">,
) {
  switch (status) {
    case "missing_api_key":
      return { code: "edit_ai_unavailable", httpStatus: 503 };
    case "file_not_found":
      return { code: "file_not_found", httpStatus: 404 };
    case "unsupported_file":
      return { code: "unsupported_file", httpStatus: 400 };
    case "no_changes":
      return { code: "edit_no_changes", httpStatus: 400 };
    case "invalid_response":
      return { code: "edit_invalid_response", httpStatus: 500 };
    case "provider_rejected":
      return { code: "edit_provider_rejected_request", httpStatus: 400 };
    case "rate_limited":
      return { code: "edit_rate_limited", httpStatus: 429 };
    case "model_error":
      return { code: "edit_generation_failed", httpStatus: 500 };
    case "sandbox_not_running":
      return { code: "sandbox_not_running", httpStatus: 409 };
    case "invalid_path":
      return { code: "invalid_path", httpStatus: 400 };
    default:
      return { code: "edit_prepare_failed", httpStatus: 500 };
  }
}

async function handlePrepareEdit(
  request: Request,
  context: IssueSandboxRouteContext,
) {
  const requestExpectsJson = wantsJson(request);
  const access = await getOwnedIssueProject(request, context);

  if ("response" in access) {
    const routeResponse = access.response!;

    return requestExpectsJson
      ? NextResponse.json(
          {
            code:
              routeResponse.status === 401
                ? "unauthenticated"
                : "project_not_found",
            status: "error" as const,
          },
          { status: routeResponse.status },
        )
      : routeResponse;
  }

  const { filePath, instruction, sessionId } = await getRequestedEditInput(
    request,
  );

  if (!sessionId) {
    return requestExpectsJson
      ? jsonError("missing_session_id")
      : redirectToIssueWithStatus(
          request,
          access.project.id,
          access.issueNumber,
          "error",
          "missing_session_id",
        );
  }

  if (
    !verifyIssueSandboxAccess({
      issueNumber: access.issueNumber,
      projectId: access.project.id,
      sessionId,
      userId: access.userId,
    })
  ) {
    return requestExpectsJson
      ? jsonError("session_not_found", 404)
      : redirectToIssueWithStatus(
          request,
          access.project.id,
          access.issueNumber,
          "error",
          "session_not_found",
        );
  }

  if (!filePath) {
    return requestExpectsJson
      ? jsonError("missing_file_path")
      : redirectToIssueWithStatus(
          request,
          access.project.id,
          access.issueNumber,
          "error",
          "missing_file_path",
        );
  }

  if (!instruction) {
    return requestExpectsJson
      ? jsonError("missing_instruction")
      : redirectToIssueWithStatus(
          request,
          access.project.id,
          access.issueNumber,
          "error",
          "missing_instruction",
        );
  }

  const issueResult = await fetchProjectIssue(
    access.project.repoOwner,
    access.project.repoName,
    access.issueNumber,
  );

  if (issueResult.status !== "ok") {
    const code =
      issueResult.status === "missing_access"
        ? "edit_access_missing"
        : "issue_unavailable";

    return requestExpectsJson
      ? jsonError(code, issueResult.status === "missing_access" ? 403 : 400)
      : redirectToIssueWithStatus(
          request,
          access.project.id,
          access.issueNumber,
          "error",
          code,
        );
  }

  const preparedEdit = await prepareSandboxSingleFileAiEdit({
    filePath,
    issueTitle: issueResult.issue.title,
    repoName: access.project.repoName,
    repoOwner: access.project.repoOwner,
    sessionId,
    userInstruction: instruction,
  });

  if (preparedEdit.status !== "ok") {
    const failure = mapPreparedEditFailure(preparedEdit.status);

    return requestExpectsJson
      ? jsonError(failure.code, failure.httpStatus)
      : redirectToIssueWithStatus(
          request,
          access.project.id,
          access.issueNumber,
          "error",
          failure.code,
        );
  }

  let chatMessages: Awaited<ReturnType<typeof appendIssueChatMessages>>;

  try {
    const chatSession = await getOrCreateIssueChatSession({
      issueNumber: access.issueNumber,
      projectId: access.project.id,
      title: issueResult.issue.title,
      userId: access.userId,
    });

    chatMessages = await appendIssueChatMessages(chatSession.id, [
      {
        body: `${instruction}\n\nIssue #${access.issueNumber} · ${preparedEdit.filePath}`,
        role: "user",
      },
      {
        body: `Prepared sandbox edit for ${preparedEdit.filePath}.\n\n${preparedEdit.summary}`,
        role: "assistant",
        tone: "success",
      },
    ]);
  } catch {
    return requestExpectsJson
      ? jsonError("chat_persist_failed", 500)
      : redirectToIssueWithStatus(
          request,
          access.project.id,
          access.issueNumber,
          "error",
          "chat_persist_failed",
        );
  }

  revalidateProjectGitHubReads({
    issueNumber: access.issueNumber,
    repoName: access.project.repoName,
    repoOwner: access.project.repoOwner,
  });

  if (requestExpectsJson) {
    return NextResponse.json({
      diff: preparedEdit.diff,
      filePath: preparedEdit.filePath,
      messages: chatMessages,
      session: preparedEdit.session,
      status: "ok" as const,
    });
  }

  return redirectToIssueWithStatus(
    request,
    access.project.id,
    access.issueNumber,
    "success",
    "edit_prepared",
  );
}

export async function PUT(request: Request, context: IssueSandboxRouteContext) {
  return handlePrepareEdit(request, context);
}

export async function POST(
  request: Request,
  context: IssueSandboxRouteContext,
) {
  return handlePrepareEdit(request, context);
}
