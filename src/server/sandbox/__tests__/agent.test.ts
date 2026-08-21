import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type {
  AIGenerateTextInput,
  AIGenerateTextResult,
  AIMessage,
  AIToolCall,
} from "~/server/ai/types";
import type { SandboxAgentInput, SandboxSession } from "~/server/sandbox/types";
import type { SandboxAgentTraceEvent } from "../agent-trace";
import AGENT_FINISH_PROMPT_TEMPLATE from "../prompts/agent-finish.txt";
import AGENT_MULTITOOL_RETRY_PROMPT_TEMPLATE from "../prompts/agent-multitool-retry.txt";
import AGENT_SYSTEM_PROMPT_TEMPLATE from "../prompts/agent-system.txt";

const {
  generateTextMock,
  getSessionMock,
  globToolExecuteMock,
  listToolExecuteMock,
  readToolExecuteMock,
  replaceToolExecuteMock,
  runCommandMock,
  searchToolExecuteMock,
  writeToolExecuteMock,
} = vi.hoisted(() => ({
  generateTextMock: vi.fn<
    (input: AIGenerateTextInput) => Promise<AIGenerateTextResult>
  >(),
  getSessionMock: vi.fn(),
  globToolExecuteMock: vi.fn(),
  listToolExecuteMock: vi.fn(),
  readToolExecuteMock: vi.fn(),
  replaceToolExecuteMock: vi.fn(),
  runCommandMock: vi.fn(),
  searchToolExecuteMock: vi.fn(),
  writeToolExecuteMock: vi.fn(),
}));

vi.mock("~/server/ai/provider", () => ({
  aiProvider: {
    generateText: generateTextMock,
  },
  aiProviderName: "openrouter",
}));

vi.mock("~/server/sandbox/provider", () => ({
  sandboxProvider: {
    get: getSessionMock,
    runCommand: runCommandMock,
  },
}));

function buildToolDefinition(name: string, description: string) {
  return {
    function: {
      description,
      name,
      parameters: {
        additionalProperties: false,
        type: "object",
      },
    },
    type: "function" as const,
  };
}

vi.mock("~/server/sandbox/tools/model-tools", () => ({
  buildSandboxAgentModelTools: () => [
    buildToolDefinition("glob_files", "Find files by glob pattern."),
    buildToolDefinition("list_directory", "List files in a directory."),
    buildToolDefinition("read_file", "Read a file from the sandbox."),
    buildToolDefinition("search_code", "Search code in the sandbox."),
    buildToolDefinition("replace_in_file", "Replace text in a sandbox file."),
    buildToolDefinition("write_file", "Write a file in the sandbox."),
  ],
}));

function buildRegistryTool(
  id: string,
  description: string,
  execute: ReturnType<typeof vi.fn>,
) {
  return {
    description,
    execute,
    id,
    parameters: {
      additionalProperties: false,
      type: "object",
    },
  };
}

vi.mock("~/server/sandbox/tools/registry", () => ({
  getSandboxAgentTool: (name: string) => {
    switch (name) {
      case "glob_files":
        return buildRegistryTool(
          "glob_files",
          "Find files by glob pattern.",
          globToolExecuteMock,
        );
      case "list_directory":
        return buildRegistryTool(
          "list_directory",
          "List files in a directory.",
          listToolExecuteMock,
        );
      case "read_file":
        return buildRegistryTool(
          "read_file",
          "Read a file from the sandbox.",
          readToolExecuteMock,
        );
      case "search_code":
        return buildRegistryTool(
          "search_code",
          "Search code in the sandbox.",
          searchToolExecuteMock,
        );
      case "replace_in_file":
        return buildRegistryTool(
          "replace_in_file",
          "Replace text in a sandbox file.",
          replaceToolExecuteMock,
        );
      case "write_file":
        return buildRegistryTool(
          "write_file",
          "Write a file in the sandbox.",
          writeToolExecuteMock,
        );
      default:
        return undefined;
    }
  },
}));

import { runSandboxAgent } from "../agent";

const agentSpanExporter = new InMemorySpanExporter();
const agentTraceProvider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(agentSpanExporter)],
});

trace.setGlobalTracerProvider(agentTraceProvider);

afterAll(async () => {
  await agentTraceProvider.shutdown();
});

const mockSession: SandboxSession = {
  environmentId: "env-test",
  logs: [],
  previewState: "ready",
  previewUrl: "https://preview.test",
  sessionId: "session-test",
  status: "running",
};

const baseInput: SandboxAgentInput = {
  conversationHistory: [],
  conversationSessionId: "chat-session-test",
  issueNumber: 16,
  issueTitle: "Replace HealSync with Tessera",
  mode: "build",
  projectId: "project-test",
  repoName: "Portfolio",
  repoOwner: "raghavvvgaba",
  sessionId: "session-test",
  userInstruction: "Replace HealSync with Tessera on the projects page.",
};

function createToolCall(
  name: string,
  args: Record<string, unknown>,
  id = `call-${name}`,
): AIToolCall {
  return {
    function: {
      arguments: JSON.stringify(args),
      name,
    },
    id,
    type: "function",
  };
}

function createModelResponse(
  overrides: Partial<AIGenerateTextResult> = {},
): AIGenerateTextResult {
  return {
    model: "test-model",
    text: "",
    ...overrides,
  };
}

function getFinalModelMessages() {
  const finalCall = generateTextMock.mock.calls.at(-1)?.[0];

  return (finalCall?.messages ?? []) as AIMessage[];
}

function getModelCall(index: number) {
  return generateTextMock.mock.calls[index]?.[0] as
    | AIGenerateTextInput
    | undefined;
}

function getAssistantToolCallMessage(messages: AIMessage[]) {
  return messages.find(
    (message) => message.role === "assistant" && "tool_calls" in message,
  );
}

function getToolMessages(messages: AIMessage[]) {
  return messages.filter((message) => message.role === "tool");
}

function parseToolMessage(message: AIMessage) {
  return JSON.parse((message as { content: string }).content) as Record<
    string,
    unknown
  >;
}

function formatPromptTemplate(
  template: string,
  replacements: Record<string, string> = {},
) {
  return Object.entries(replacements).reduce(
    (content, [key, value]) => content.replaceAll(`{{${key}}}`, value),
    template,
  ).trim();
}

const expectedSystemPrompt = formatPromptTemplate(AGENT_SYSTEM_PROMPT_TEMPLATE, {
  AGENT_MODE: "build",
  MAX_READ_ONLY_TOOL_CALLS: "5",
  MODE_INSTRUCTIONS: [
    "Build mode permits file edits, but only when the user's instruction explicitly requests a change.",
    "Questions and explanations do not authorize edits. Never switch modes yourself.",
  ].join(" "),
});

const expectedFinishPrompt = formatPromptTemplate(AGENT_FINISH_PROMPT_TEMPLATE, {
  MODE_FINISH_INSTRUCTION: "Report only changes that were actually completed.",
});

const expectedMultiToolRetryPrompt = formatPromptTemplate(
  AGENT_MULTITOOL_RETRY_PROMPT_TEMPLATE,
  {
    MAX_READ_ONLY_TOOL_CALLS: "5",
  },
);

beforeEach(() => {
  agentSpanExporter.reset();
  generateTextMock.mockReset();
  getSessionMock.mockReset();
  globToolExecuteMock.mockReset();
  listToolExecuteMock.mockReset();
  readToolExecuteMock.mockReset();
  replaceToolExecuteMock.mockReset();
  runCommandMock.mockReset();
  searchToolExecuteMock.mockReset();
  writeToolExecuteMock.mockReset();

  getSessionMock.mockResolvedValue(mockSession);
  globToolExecuteMock.mockResolvedValue({
    cap: 100,
    paths: ["src/app/page.tsx"],
    truncated: false,
  });
  runCommandMock.mockResolvedValue({
    command: "git diff -- .",
    exitCode: 0,
    stderr: "",
    stdout: "diff --git a/src/data/projects.js b/src/data/projects.js",
  });

  listToolExecuteMock.mockResolvedValue([
    {
      name: "ProjectsPage.jsx",
      path: "src/pages/ProjectsPage.jsx",
      type: "file",
    },
  ]);
  readToolExecuteMock.mockImplementation(async (args) => ({
    content: `content for ${String(args.path)}`,
    endLine: 4,
    path: String(args.path),
    size: 120,
    startLine: 1,
    totalLines: 4,
    truncated: false,
  }));
  searchToolExecuteMock.mockResolvedValue({
    caps: {
      perFile: 2,
      total: 10,
    },
    matches: [
      {
        column: 5,
        line: 10,
        path: "src/data/projects.js",
        text: "title: 'Tessera'",
      },
    ],
    truncated: false,
  });
  replaceToolExecuteMock.mockResolvedValue({
    newText: "Full stack + AI engineer",
    oldText: "Full stack developer",
    path: "src/components/Hero.jsx",
    session: mockSession,
    startLine: 148,
  });
  writeToolExecuteMock.mockResolvedValue({
    path: "src/data/projects.js",
    session: mockSession,
  });
});

describe("runSandboxAgent", () => {
  it("records one span for the complete agent run", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "The requested state is already present.",
          usage: {
            completionTokens: 20,
            cost: 0.001,
            promptTokens: 100,
            totalTokens: 120,
          },
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "Nothing needed to change.",
            status: "completed",
          }),
          usage: {
            completionTokens: 10,
            cost: 0.002,
            promptTokens: 80,
            totalTokens: 90,
          },
        }),
      );

    await runSandboxAgent({
      ...baseInput,
      model: "test-model",
    });

    const spans = agentSpanExporter.getFinishedSpans();
    const agentRunSpan = spans.find((span) => span.name === "sandbox_agent.run");
    const modelSpans = spans.filter((span) => span.name === "chat test-model");

    expect(agentRunSpan).toMatchObject({
      attributes: {
        "agent.cost_usd": 0.003,
        "agent.files_touched_count": 0,
        "agent.mode": "build",
        "agent.status": "completed",
        "agent.steps_used": 2,
        "conversation.session_id": "chat-session-test",
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.request.model": "test-model",
        "gen_ai.usage.input_tokens": 180,
        "gen_ai.usage.output_tokens": 30,
        "gen_ai.usage.total_tokens": 210,
        "issue.number": 16,
      },
      name: "sandbox_agent.run",
      status: {
        code: 1,
      },
    });
    expect(agentRunSpan?.attributes["conversation.session_id"]).not.toBe(
      baseInput.sessionId,
    );
    expect(modelSpans).toHaveLength(2);
    expect(modelSpans.map((span) => span.attributes["agent.phase"])).toEqual([
      "tool",
      "finish",
    ]);
    expect(modelSpans.map((span) => span.attributes["agent.step"])).toEqual([
      1, 2,
    ]);
    expect(runCommandMock).not.toHaveBeenCalled();
    for (const span of modelSpans) {
      expect(span.kind).toBe(SpanKind.CLIENT);
      expect(span.parentSpanContext?.spanId).toBe(
        agentRunSpan?.spanContext().spanId,
      );
      expect(span.spanContext().traceId).toBe(
        agentRunSpan?.spanContext().traceId,
      );
    }
  });

  it("correlates runs by conversation session without sharing trace IDs", async () => {
    generateTextMock.mockResolvedValue(
      createModelResponse({
        text: JSON.stringify({
          message: "Nothing needed to change.",
          status: "completed",
        }),
      }),
    );

    await runSandboxAgent(baseInput);
    await runSandboxAgent(baseInput);
    await runSandboxAgent({
      ...baseInput,
      conversationSessionId: "chat-session-other",
    });

    const spans = agentSpanExporter
      .getFinishedSpans()
      .filter((span) => span.name === "sandbox_agent.run");
    const conversationSessionIds = spans.map(
      (span) => span.attributes["conversation.session_id"],
    );
    const traceIds = spans.map((span) => span.spanContext().traceId);

    expect(conversationSessionIds).toEqual([
      "chat-session-test",
      "chat-session-test",
      "chat-session-other",
    ]);
    expect(new Set(traceIds)).toHaveLength(3);
  });

  it("creates semantic model and tool spans beneath the agent run", async () => {
    const traceEvents: SandboxAgentTraceEvent[] = [];
    const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";

    readToolExecuteMock.mockResolvedValueOnce({
      content: `Bearer ${secret}`,
      endLine: 4,
      path: "src/components/Button.tsx",
      size: 120,
      startLine: 1,
      totalLines: 4,
      truncated: false,
    });
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: `I'll inspect the file using ${secret}.`,
          toolCalls: [
            createToolCall(
              "read_file",
              {
                path: "src/components/Button.tsx",
                token: secret,
              },
              "call-read",
            ),
          ],
          usage: {
            completionTokens: 20,
            cost: 0.001,
            promptTokens: 100,
            reasoningTokens: 4,
            totalTokens: 120,
          },
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "The file is already correct.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "Nothing needed to change.",
            status: "completed",
          }),
        }),
      );

    await runSandboxAgent(
      {
        ...baseInput,
        model: "test-model",
      },
      {
        onTrace(event) {
          traceEvents.push(event);
        },
      },
    );

    const spans = agentSpanExporter.getFinishedSpans();
    const agentRunSpan = spans.find((span) => span.name === "sandbox_agent.run");
    const childSpans = spans.filter(
      (span) =>
        span.parentSpanContext?.spanId === agentRunSpan?.spanContext().spanId,
    );
    const modelSpans = childSpans.filter(
      (span) => span.name === "chat test-model",
    );
    const toolSpan = childSpans.find(
      (span) => span.name === "execute_tool read_file",
    );

    expect(childSpans.map((span) => span.name)).toEqual([
      "chat test-model",
      "execute_tool read_file",
      "chat test-model",
      "chat test-model",
    ]);
    expect(modelSpans.map((span) => span.attributes["agent.phase"])).toEqual([
      "tool",
      "tool",
      "finish",
    ]);
    expect(modelSpans.map((span) => span.attributes["agent.step"])).toEqual([
      1, 2, 3,
    ]);
    expect(modelSpans[0]).toMatchObject({
      attributes: {
        "agent.cost_usd": 0.001,
        "agent.model.status": "completed",
        "agent.model.tool_call_count": 1,
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": "openrouter",
        "gen_ai.request.model": "test-model",
        "gen_ai.response.model": "test-model",
        "gen_ai.usage.input_tokens": 100,
        "gen_ai.usage.output_tokens": 20,
        "gen_ai.usage.reasoning.output_tokens": 4,
        "gen_ai.usage.total_tokens": 120,
      },
      kind: SpanKind.CLIENT,
      status: { code: SpanStatusCode.OK },
    });
    expect(modelSpans[0]?.attributes["agent.model.response_preview"]).toContain(
      "[REDACTED]",
    );
    expect(
      modelSpans[0]?.attributes["agent.model.tool_calls_preview"],
    ).toContain("[REDACTED]");
    expect(JSON.stringify(modelSpans[0]?.attributes)).not.toContain(secret);

    expect(toolSpan).toMatchObject({
      attributes: {
        "agent.step": 1,
        "agent.tool.paths": ["src/components/Button.tsx"],
        "agent.tool.status": "ok",
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.call.id": "call-read",
        "gen_ai.tool.name": "read_file",
        "gen_ai.tool.type": "function",
      },
      kind: SpanKind.INTERNAL,
      status: { code: SpanStatusCode.OK },
    });
    expect(toolSpan?.attributes["agent.tool.arguments_preview"]).toContain(
      "[REDACTED]",
    );
    expect(toolSpan?.attributes["agent.tool.result_preview"]).toContain(
      "[REDACTED]",
    );
    expect(JSON.stringify(toolSpan?.attributes)).not.toContain(secret);
    expect(toolSpan?.spanContext().traceId).toBe(
      agentRunSpan?.spanContext().traceId,
    );

    expect(traceEvents.map((event) => event.type)).toContain("model_response");
    expect(traceEvents.map((event) => event.type)).toContain("tool_result");
    expect(
      traceEvents.find((event) => event.type === "tool_result"),
    ).toMatchObject({
      payload: {
        arguments: {
          path: "src/components/Button.tsx",
          token: "[REDACTED]",
        },
      },
      toolCallId: "call-read",
      toolName: "read_file",
    });
  });

  it("marks model and tool failures on their semantic spans", async () => {
    generateTextMock.mockRejectedValueOnce(
      new Error("OpenRouter rate limited this request"),
    );

    await runSandboxAgent({
      ...baseInput,
      model: "test-model",
    });

    const modelFailureSpan = agentSpanExporter
      .getFinishedSpans()
      .find((span) => span.name === "chat test-model");

    expect(modelFailureSpan).toMatchObject({
      attributes: {
        "agent.model.status": "failed",
        "error.type": "model_rate_limited",
      },
      status: {
        code: SpanStatusCode.ERROR,
        message: "The AI model is rate limited right now. Please try again.",
      },
    });

    agentSpanExporter.reset();
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll try an unsupported tool.",
          toolCalls: [createToolCall("unknown_tool", {}, "call-unknown")],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({ text: "I'll stop here." }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "The unsupported tool was not executed.",
            status: "blocked",
          }),
        }),
      );

    await runSandboxAgent(baseInput);

    const toolFailureSpan = agentSpanExporter
      .getFinishedSpans()
      .find((span) => span.name === "execute_tool unknown_tool");

    expect(toolFailureSpan).toMatchObject({
      attributes: {
        "agent.tool.status": "tool_failure",
        "error.type": "unknown_tool",
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": "unknown_tool",
      },
      status: { code: SpanStatusCode.ERROR },
    });
  });

  it("places persisted conversation history before the current instruction", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I can continue from the earlier request.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "I continued from the earlier request.",
            status: "completed",
          }),
        }),
      );

    await runSandboxAgent({
      ...baseInput,
      conversationHistory: [
        {
          content: "Rename the profile card name to Dev.",
          role: "user",
        },
        {
          content: "Switch to Build mode to apply the rename.",
          role: "assistant",
        },
      ],
      userInstruction: "Implement the change I requested earlier.",
    });

    const messages = getModelCall(0)?.messages ?? [];

    expect(messages[0]).toEqual({
      content: expectedSystemPrompt,
      role: "system",
    });
    expect(messages.slice(1, 3)).toEqual([
      {
        content: "Rename the profile card name to Dev.",
        role: "user",
      },
      {
        content: "Switch to Build mode to apply the rename.",
        role: "assistant",
      },
    ]);
    expect(messages[3]).toMatchObject({
      role: "user",
    });
    expect(messages[3]?.content).toContain(
      "Implement the change I requested earlier.",
    );
    expect(
      messages.filter((message) =>
        message.content.includes("Implement the change I requested earlier."),
      ),
    ).toHaveLength(1);
  });

  it("keeps the existing single-turn transcript when history is empty", async () => {
    generateTextMock
      .mockResolvedValueOnce(createModelResponse({ text: "Done." }))
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "Done.",
            status: "completed",
          }),
        }),
      );

    await runSandboxAgent(baseInput);

    const messages = getModelCall(0)?.messages ?? [];

    expect(messages[0]).toEqual({
      content: expectedSystemPrompt,
      role: "system",
    });
    expect(messages[1]).toMatchObject({
      role: "user",
    });
    expect(messages[1]?.content).toContain(baseInput.userInstruction);
  });

  it("emits progress for model text, tool calls, and finalization", async () => {
    const progressMessages: string[] = [];

    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll inspect the button component first.",
          toolCalls: [
            createToolCall("read_file", { path: "src/components/Button.tsx" }, "call-read"),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I updated the button state.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "I updated the button state.",
            status: "completed",
          }),
        }),
      );

    await runSandboxAgent(baseInput, {
      onProgress(event) {
        progressMessages.push(event.message);
      },
    });

    expect(progressMessages).toEqual([
      "I'll inspect the button component first.",
      "Reading src/components/Button.tsx...",
      "Finishing up...",
    ]);
  });

  it("uses the structured finish message instead of raw no-tool prose with protocol JSON", async () => {
    const rawNoToolResponse = [
      "Based on the repository name, this appears to be a portfolio project.",
      "",
      "```json",
      JSON.stringify(
        {
          clarificationQuestion:
            "Would you like to explore the project files?",
          message: "This is a personal portfolio project.",
          status: "completed",
        },
        null,
        2,
      ),
      "```",
    ].join("\n");

    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: rawNoToolResponse,
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            clarificationQuestion:
              "Would you like to explore the project files?",
            message:
              "This is a personal portfolio project. No code changes were requested.",
            status: "completed",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);
    const finalMessages = getFinalModelMessages();

    expect(result).toMatchObject({
      clarificationQuestion: "Would you like to explore the project files?",
      message:
        "This is a personal portfolio project. No code changes were requested.",
      status: "completed",
      stepsUsed: 2,
    });
    expect(finalMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: rawNoToolResponse,
          role: "assistant",
        }),
      ]),
    );
  });

  it("denies write tools in plan mode and tells the model to hand off to build", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll update the README now.",
          toolCalls: [
            createToolCall(
              "write_file",
              {
                content: "# Updated project",
                path: "README.md",
              },
              "call-plan-write",
            ),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "The implementation plan is ready. Switch to Build mode to apply it.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message:
              "The README update is planned. Switch to Build mode to apply it.",
            status: "completed",
          }),
        }),
      );

    const result = await runSandboxAgent({
      ...baseInput,
      mode: "plan",
      userInstruction: "Update the README with an accurate project summary.",
    });
    const firstModelCall = getModelCall(0);
    const toolMessage = getToolMessages(getFinalModelMessages())[0]!;
    const toolResult = parseToolMessage(toolMessage);
    const availableToolNames = firstModelCall?.tools?.map(
      (tool) => tool.function.name,
    );

    expect(availableToolNames).toEqual([
      "glob_files",
      "list_directory",
      "read_file",
      "search_code",
    ]);
    expect(writeToolExecuteMock).not.toHaveBeenCalled();
    expect(replaceToolExecuteMock).not.toHaveBeenCalled();
    expect(toolResult).toMatchObject({
      code: "write_not_allowed_in_plan_mode",
      ok: false,
      retryable: true,
      tool: "write_file",
    });
    expect(toolResult.message).toContain("switch to Build mode");
    expect(result).toMatchObject({
      filesTouched: [],
      message: "The README update is planned. Switch to Build mode to apply it.",
      status: "completed",
    });
  });

  it("answers a project question in plan mode without suggesting a mode change", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll inspect the project metadata.",
          toolCalls: [
            createToolCall("list_directory", { path: "." }, "call-list"),
            createToolCall("read_file", { path: "README.md" }, "call-read"),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "This is a personal portfolio project.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "This is a personal portfolio project.",
            status: "completed",
          }),
        }),
      );

    const result = await runSandboxAgent({
      ...baseInput,
      mode: "plan",
      userInstruction: "What is this project?",
    });

    expect(listToolExecuteMock).toHaveBeenCalledTimes(1);
    expect(readToolExecuteMock).toHaveBeenCalledTimes(1);
    expect(writeToolExecuteMock).not.toHaveBeenCalled();
    expect(replaceToolExecuteMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      filesTouched: ["README.md"],
      message: "This is a personal portfolio project.",
      status: "completed",
    });
    expect(result.message).not.toContain("Build mode");
  });

  it("accepts a valid two-call read-only batch and appends both tool results", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll inspect the page and the data file.",
          toolCalls: [
            createToolCall("list_directory", { path: "src/pages" }, "call-list"),
            createToolCall("read_file", { path: "src/data/projects.js" }, "call-read"),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Done inspecting.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "Inspected the relevant files.",
            status: "completed",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);
    const finalMessages = getFinalModelMessages();
    const assistantToolCallMessage = getAssistantToolCallMessage(finalMessages);
    const toolMessages = getToolMessages(finalMessages);

    expect(result).toMatchObject({
      filesTouched: ["src/data/projects.js"],
      message: "Inspected the relevant files.",
      status: "completed",
      stepsUsed: 3,
    });
    expect(listToolExecuteMock).toHaveBeenCalledTimes(1);
    expect(readToolExecuteMock).toHaveBeenCalledTimes(1);
    expect(assistantToolCallMessage).toMatchObject({
      content: "I'll inspect the page and the data file.",
      role: "assistant",
      tool_calls: [
        expect.objectContaining({ id: "call-list" }),
        expect.objectContaining({ id: "call-read" }),
      ],
    });
    expect(toolMessages).toHaveLength(2);
    expect(toolMessages[0]).toMatchObject({
      role: "tool",
      tool_call_id: "call-list",
    });
    expect(toolMessages[1]).toMatchObject({
      role: "tool",
      tool_call_id: "call-read",
    });
    expect(getModelCall(0)?.messages[0]).toMatchObject({
      content: expectedSystemPrompt,
      role: "system",
    });

    const agentRunSpan = agentSpanExporter
      .getFinishedSpans()
      .find((span) => span.name === "sandbox_agent.run");
    const toolSpans = agentSpanExporter
      .getFinishedSpans()
      .filter((span) => span.name.startsWith("execute_tool "));

    expect(toolSpans.map((span) => span.name)).toEqual([
      "execute_tool list_directory",
      "execute_tool read_file",
    ]);
    expect(toolSpans.map((span) => span.attributes["agent.step"])).toEqual([
      1, 1,
    ]);
    expect(
      toolSpans.map((span) => span.parentSpanContext?.spanId),
    ).toEqual([
      agentRunSpan?.spanContext().spanId,
      agentRunSpan?.spanContext().spanId,
    ]);
  });

  it("accepts glob_files in a read-only batch", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll find and inspect the page.",
          toolCalls: [
            createToolCall(
              "glob_files",
              { patterns: ["src/**/*.tsx", "!**/*.test.tsx"] },
              "call-glob",
            ),
            createToolCall(
              "read_file",
              { path: "src/app/page.tsx" },
              "call-read",
            ),
          ],
        }),
      )
      .mockResolvedValueOnce(createModelResponse({ text: "Done inspecting." }))
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "Found and inspected the relevant page.",
            status: "completed",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);
    const toolMessages = getToolMessages(getFinalModelMessages());

    expect(result).toMatchObject({
      message: "Found and inspected the relevant page.",
      status: "completed",
    });
    expect(globToolExecuteMock).toHaveBeenCalledWith(
      { patterns: ["src/**/*.tsx", "!**/*.test.tsx"] },
      { sessionId: "session-test" },
    );
    expect(toolMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool_call_id: "call-glob" }),
        expect.objectContaining({ tool_call_id: "call-read" }),
      ]),
    );
  });

  it("accepts up to five read-only tool calls in one turn", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll inspect all the relevant files first.",
          toolCalls: [
            createToolCall("list_directory", { path: "src/pages" }, "call-1"),
            createToolCall("read_file", { path: "src/pages/ProjectsPage.jsx" }, "call-2"),
            createToolCall("read_file", { path: "src/data/projects.js" }, "call-3"),
            createToolCall("search_code", { path: "src", query: "healsync" }, "call-4"),
            createToolCall("search_code", { path: "src", query: "tessera" }, "call-5"),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Done inspecting.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "Checked the relevant files and search results.",
            status: "completed",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);
    const finalMessages = getFinalModelMessages();

    expect(result).toMatchObject({
      filesTouched: ["src/data/projects.js", "src/pages/ProjectsPage.jsx"],
      message: "Checked the relevant files and search results.",
      status: "completed",
      stepsUsed: 3,
    });
    expect(listToolExecuteMock).toHaveBeenCalledTimes(1);
    expect(readToolExecuteMock).toHaveBeenCalledTimes(2);
    expect(searchToolExecuteMock).toHaveBeenCalledTimes(2);
    expect(getAssistantToolCallMessage(finalMessages)).toMatchObject({
      role: "assistant",
      tool_calls: [
        expect.objectContaining({ id: "call-1" }),
        expect.objectContaining({ id: "call-2" }),
        expect.objectContaining({ id: "call-3" }),
        expect.objectContaining({ id: "call-4" }),
        expect.objectContaining({ id: "call-5" }),
      ],
    });
    expect(getToolMessages(finalMessages)).toHaveLength(5);
  });

  it("retries once when more than five read-only tool calls are returned", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll inspect every likely file.",
          toolCalls: [
            createToolCall("read_file", { path: "src/a.ts" }, "call-1"),
            createToolCall("read_file", { path: "src/b.ts" }, "call-2"),
            createToolCall("read_file", { path: "src/c.ts" }, "call-3"),
            createToolCall("read_file", { path: "src/d.ts" }, "call-4"),
            createToolCall("read_file", { path: "src/e.ts" }, "call-5"),
            createToolCall("read_file", { path: "src/f.ts" }, "call-6"),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll inspect every likely file again.",
          toolCalls: [
            createToolCall("read_file", { path: "src/a.ts" }, "call-retry-1"),
            createToolCall("read_file", { path: "src/b.ts" }, "call-retry-2"),
            createToolCall("read_file", { path: "src/c.ts" }, "call-retry-3"),
            createToolCall("read_file", { path: "src/d.ts" }, "call-retry-4"),
            createToolCall("read_file", { path: "src/e.ts" }, "call-retry-5"),
            createToolCall("read_file", { path: "src/f.ts" }, "call-retry-6"),
          ],
        }),
      );

    const result = await runSandboxAgent(baseInput);
    const retryMessages = getFinalModelMessages();

    expect(result).toMatchObject({
      filesTouched: [],
      message: "The agent returned an invalid tool batch and could not recover.",
      status: "failed",
      stepsUsed: 2,
    });
    expect(readToolExecuteMock).not.toHaveBeenCalled();
    expect(retryMessages.at(-1)).toMatchObject({
      content: expectedMultiToolRetryPrompt,
      role: "user",
    });
  });

  it("rejects write_file when mixed with read-only tools", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll read and write in the same turn.",
          toolCalls: [
            createToolCall("read_file", { path: "src/data/projects.js" }, "call-read"),
            createToolCall(
              "write_file",
              {
                content: "export const projects = [];",
                path: "src/data/projects.js",
              },
              "call-write",
            ),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll read and write in the same turn again.",
          toolCalls: [
            createToolCall("read_file", { path: "src/data/projects.js" }, "call-read-retry"),
            createToolCall(
              "write_file",
              {
                content: "export const projects = [];",
                path: "src/data/projects.js",
              },
              "call-write-retry",
            ),
          ],
        }),
      );

    const result = await runSandboxAgent(baseInput);

    expect(result).toMatchObject({
      filesTouched: [],
      message: "The agent returned an invalid tool batch and could not recover.",
      status: "failed",
      stepsUsed: 2,
    });
    expect(readToolExecuteMock).not.toHaveBeenCalled();
    expect(writeToolExecuteMock).not.toHaveBeenCalled();
  });

  it("runs all read-only calls in a batch even when one returns a tool failure", async () => {
    readToolExecuteMock
      .mockResolvedValueOnce({
        content: "content for src/a.ts",
        endLine: 4,
        path: "src/a.ts",
        size: 120,
        startLine: 1,
        totalLines: 4,
        truncated: false,
      })
      .mockRejectedValueOnce(new Error("missing_path"))
      .mockResolvedValueOnce({
        content: "content for src/c.ts",
        endLine: 4,
        path: "src/c.ts",
        size: 120,
        startLine: 1,
        totalLines: 4,
        truncated: false,
      });

    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll inspect the likely files first.",
          toolCalls: [
            createToolCall("read_file", { path: "src/a.ts" }, "call-a"),
            createToolCall("read_file", { path: "src/b.ts" }, "call-b"),
            createToolCall("read_file", { path: "src/c.ts" }, "call-c"),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Done inspecting.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "Finished inspecting despite one missing file.",
            status: "completed",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);
    const finalToolMessages = getToolMessages(getFinalModelMessages());

    expect(result).toMatchObject({
      filesTouched: ["src/a.ts", "src/c.ts"],
      message: "Finished inspecting despite one missing file.",
      status: "completed",
      stepsUsed: 3,
    });
    expect(readToolExecuteMock).toHaveBeenCalledTimes(3);
    expect(finalToolMessages).toHaveLength(3);
    expect(finalToolMessages[1]).toMatchObject({
      role: "tool",
      tool_call_id: "call-b",
    });
    expect(parseToolMessage(finalToolMessages[1]!)).toMatchObject({
      arguments: {
        path: "src/b.ts",
      },
      code: "missing_path",
      message: "missing_path",
      ok: false,
      retryable: true,
      tool: "read_file",
    });
  });

  it("feeds a single-tool timeout back to the model and lets it retry", async () => {
    listToolExecuteMock
      .mockRejectedValueOnce(
        new Error("2: [unknown] The operation was aborted due to timeout"),
      )
      .mockResolvedValueOnce([
        {
          name: "src",
          path: "src",
          type: "dir",
        },
      ]);

    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll list the repository root first.",
          toolCalls: [createToolCall("list_directory", { path: "." }, "call-timeout")],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll narrow the listing to src instead.",
          toolCalls: [createToolCall("list_directory", { path: "src" }, "call-retry")],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Done inspecting.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "I narrowed the inspection after the timeout and continued.",
            status: "completed",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);
    const finalMessages = getFinalModelMessages();
    const toolMessages = getToolMessages(finalMessages);

    expect(result).toMatchObject({
      filesTouched: [],
      message: "I narrowed the inspection after the timeout and continued.",
      status: "completed",
      stepsUsed: 4,
    });
    expect(listToolExecuteMock).toHaveBeenCalledTimes(2);
    expect(toolMessages).toHaveLength(2);
    expect(parseToolMessage(toolMessages[0]!)).toMatchObject({
      arguments: {
        path: ".",
      },
      code: "2: [unknown] The operation was aborted due to timeout",
      message: "2: [unknown] The operation was aborted due to timeout",
      ok: false,
      retryable: true,
      tool: "list_directory",
    });
  });

  it("feeds a batch timeout back to the model and gives it another turn", async () => {
    listToolExecuteMock
      .mockRejectedValueOnce(new Error("The operation timed out while listing files."))
      .mockResolvedValueOnce([
        {
          name: "components",
          path: "src/components",
          type: "dir",
        },
      ]);
    readToolExecuteMock.mockResolvedValueOnce({
      content: "content for src/app/page.tsx",
      endLine: 4,
      path: "src/app/page.tsx",
      size: 120,
      startLine: 1,
      totalLines: 4,
      truncated: false,
    });

    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll inspect the root and the page file.",
          toolCalls: [
            createToolCall("list_directory", { path: "." }, "call-list-timeout"),
            createToolCall("read_file", { path: "src/app/page.tsx" }, "call-read-ok"),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll retry the directory listing with a narrower path.",
          toolCalls: [createToolCall("list_directory", { path: "src" }, "call-list-retry")],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Done inspecting.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "I recovered from the timeout by narrowing the directory listing.",
            status: "completed",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);
    const finalMessages = getFinalModelMessages();
    const toolMessages = getToolMessages(finalMessages);

    expect(result).toMatchObject({
      filesTouched: ["src/app/page.tsx"],
      message: "I recovered from the timeout by narrowing the directory listing.",
      status: "completed",
      stepsUsed: 4,
    });
    expect(toolMessages).toHaveLength(3);
    expect(parseToolMessage(toolMessages[0]!)).toMatchObject({
      arguments: {
        path: ".",
      },
      code: "The operation timed out while listing files.",
      message: "The operation timed out while listing files.",
      ok: false,
      retryable: true,
      tool: "list_directory",
    });
  });

  it("feeds sandbox-not-running back like any other tool failure and gives the model another turn", async () => {
    readToolExecuteMock
      .mockRejectedValueOnce(new Error("Sandbox is not running."))
      .mockResolvedValueOnce({
        content: "content for src/b.ts",
        endLine: 4,
        path: "src/b.ts",
        size: 120,
        startLine: 1,
        totalLines: 4,
        truncated: false,
      });

    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll inspect the file first.",
          toolCalls: [createToolCall("read_file", { path: "src/a.ts" }, "call-a")],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "That failed, so I'll inspect a different file.",
          toolCalls: [createToolCall("read_file", { path: "src/b.ts" }, "call-b")],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Done inspecting.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "I continued after the tool failure and inspected another file.",
            status: "completed",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);
    const finalToolMessages = getToolMessages(getFinalModelMessages());

    expect(result).toMatchObject({
      filesTouched: ["src/b.ts"],
      message: "I continued after the tool failure and inspected another file.",
      status: "completed",
      stepsUsed: 4,
    });
    expect(readToolExecuteMock).toHaveBeenCalledTimes(2);
    expect(finalToolMessages).toHaveLength(2);
    expect(parseToolMessage(finalToolMessages[0]!)).toMatchObject({
      arguments: {
        path: "src/a.ts",
      },
      code: "Sandbox is not running.",
      message: "Sandbox is not running.",
      ok: false,
      retryable: true,
      tool: "read_file",
    });
  });

  it("keeps a read-only batch going when one tool reports sandbox not running", async () => {
    readToolExecuteMock
      .mockResolvedValueOnce({
        content: "content for src/a.ts",
        endLine: 4,
        path: "src/a.ts",
        size: 120,
        startLine: 1,
        totalLines: 4,
        truncated: false,
      })
      .mockRejectedValueOnce(new Error("Sandbox is not running."))
      .mockResolvedValueOnce({
        content: "content for src/c.ts",
        endLine: 4,
        path: "src/c.ts",
        size: 120,
        startLine: 1,
        totalLines: 4,
        truncated: false,
      });

    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll inspect the likely files first.",
          toolCalls: [
            createToolCall("read_file", { path: "src/a.ts" }, "call-a"),
            createToolCall("read_file", { path: "src/b.ts" }, "call-b"),
            createToolCall("read_file", { path: "src/c.ts" }, "call-c"),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Done inspecting.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "I kept inspecting the remaining files after one tool failed.",
            status: "completed",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);
    const finalToolMessages = getToolMessages(getFinalModelMessages());

    expect(result).toMatchObject({
      filesTouched: ["src/a.ts", "src/c.ts"],
      message: "I kept inspecting the remaining files after one tool failed.",
      status: "completed",
      stepsUsed: 3,
    });
    expect(readToolExecuteMock).toHaveBeenCalledTimes(3);
    expect(finalToolMessages).toHaveLength(3);
    expect(parseToolMessage(finalToolMessages[1]!)).toMatchObject({
      arguments: {
        path: "src/b.ts",
      },
      code: "Sandbox is not running.",
      message: "Sandbox is not running.",
      ok: false,
      retryable: true,
      tool: "read_file",
    });
  });

  it("stops after the same tool failure repeats three times", async () => {
    readToolExecuteMock.mockRejectedValue(new Error("missing_path"));

    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll inspect the file.",
          toolCalls: [createToolCall("read_file", { path: "src/a.ts" }, "call-1")],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll retry the same file read.",
          toolCalls: [createToolCall("read_file", { path: "src/a.ts" }, "call-2")],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "This prose should not become the final blocked message.",
          toolCalls: [createToolCall("read_file", { path: "src/a.ts" }, "call-3")],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "I could not recover from the repeated read failure.",
            status: "blocked",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);
    const finalMessages = getFinalModelMessages();

    expect(result).toMatchObject({
      failureCode: "tool_retry_exhausted",
      message: "I could not recover from the repeated read failure.",
      status: "blocked",
      stepsUsed: 4,
    });
    expect(readToolExecuteMock).toHaveBeenCalledTimes(3);
    expect(
      finalMessages.some(
        (message) =>
          message.role === "user" &&
          message.content.includes("\"code\":\"tool_retry_exhausted\""),
      ),
    ).toBe(true);
  });

  it("stops after five tool-failure recovery turns even when the failing arguments keep changing", async () => {
    readToolExecuteMock.mockRejectedValue(new Error("missing_path"));

    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Try file a.",
          toolCalls: [createToolCall("read_file", { path: "src/a.ts" }, "call-1")],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Try file b.",
          toolCalls: [createToolCall("read_file", { path: "src/b.ts" }, "call-2")],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Try file c.",
          toolCalls: [createToolCall("read_file", { path: "src/c.ts" }, "call-3")],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Try file d.",
          toolCalls: [createToolCall("read_file", { path: "src/d.ts" }, "call-4")],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Try file e.",
          toolCalls: [createToolCall("read_file", { path: "src/e.ts" }, "call-5")],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "I hit the recovery limit while trying different file reads.",
            status: "blocked",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);

    expect(result).toMatchObject({
      failureCode: "tool_retry_exhausted",
      message: "I hit the recovery limit while trying different file reads.",
      status: "blocked",
      stepsUsed: 6,
    });
    expect(readToolExecuteMock).toHaveBeenCalledTimes(5);
  });

  it("runs replace_in_file as a single-call write-like turn", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll update the hero title now.",
          toolCalls: [
            createToolCall(
              "replace_in_file",
              {
                newText: "Full stack + AI engineer",
                oldText: "Full stack developer",
                path: "src/components/Hero.jsx",
              },
              "call-replace",
            ),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Done. I updated the hero title.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "Updated the hero title.",
            status: "completed",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);

    expect(result).toMatchObject({
      filesTouched: ["src/components/Hero.jsx"],
      message: "Updated the hero title.",
      session: mockSession,
      status: "completed",
      stepsUsed: 3,
    });
    expect(replaceToolExecuteMock).toHaveBeenCalledWith(
      {
        newText: "Full stack + AI engineer",
        oldText: "Full stack developer",
        path: "src/components/Hero.jsx",
      },
      {
        sessionId: "session-test",
      },
    );
  });

  it("rejects replace_in_file when mixed with read-only tools", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll read and replace in the same turn.",
          toolCalls: [
            createToolCall("read_file", { path: "src/components/Hero.jsx" }, "call-read"),
            createToolCall(
              "replace_in_file",
              {
                newText: "Full stack + AI engineer",
                oldText: "Full stack developer",
                path: "src/components/Hero.jsx",
              },
              "call-replace",
            ),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll make the same invalid batch again.",
          toolCalls: [
            createToolCall("read_file", { path: "src/components/Hero.jsx" }, "call-read-2"),
            createToolCall(
              "replace_in_file",
              {
                newText: "Full stack + AI engineer",
                oldText: "Full stack developer",
                path: "src/components/Hero.jsx",
              },
              "call-replace-2",
            ),
          ],
        }),
      );

    const result = await runSandboxAgent(baseInput);

    expect(result).toMatchObject({
      filesTouched: [],
      message: "The agent returned an invalid tool batch and could not recover.",
      status: "failed",
      stepsUsed: 2,
    });
    expect(readToolExecuteMock).not.toHaveBeenCalled();
    expect(replaceToolExecuteMock).not.toHaveBeenCalled();
  });

  it("feeds replace_in_file failure back as structured tool JSON and lets the model recover", async () => {
    replaceToolExecuteMock
      .mockRejectedValueOnce(new Error("text_not_found"))
      .mockResolvedValueOnce({
        newText: "Full stack + AI engineer",
        oldText: "Full stack developer",
        path: "src/components/Hero.jsx",
        session: mockSession,
        startLine: 149,
      });

    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll replace the exact text I found.",
          toolCalls: [
            createToolCall(
              "replace_in_file",
              {
                newText: "Full stack + AI engineer",
                oldText: "Full stack developer",
                path: "src/components/Hero.jsx",
              },
              "call-replace-fail",
            ),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll retry with more surrounding text.",
          toolCalls: [
            createToolCall(
              "replace_in_file",
              {
                newText: "title: Full stack + AI engineer",
                oldText: "title: Full stack developer",
                path: "src/components/Hero.jsx",
              },
              "call-replace-retry",
            ),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Done. I updated the hero title.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "Updated the hero title with a unique exact match.",
            status: "completed",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);
    const toolMessages = getToolMessages(getFinalModelMessages());

    expect(result).toMatchObject({
      filesTouched: ["src/components/Hero.jsx"],
      message: "Updated the hero title with a unique exact match.",
      status: "completed",
      stepsUsed: 4,
    });
    expect(replaceToolExecuteMock).toHaveBeenCalledTimes(2);
    expect(parseToolMessage(toolMessages[0]!)).toMatchObject({
      arguments: {
        newText: "Full stack + AI engineer",
        oldText: "Full stack developer",
        path: "src/components/Hero.jsx",
      },
      code: "text_not_found",
      message: "text_not_found",
      ok: false,
      retryable: true,
      tool: "replace_in_file",
    });
  });

  it("forces one focused retry after malformed replace_in_file arguments", async () => {
    const replaceSchema = z.object({
      newText: z.string(),
      oldText: z.string(),
      path: z.string(),
    });
    const invalidArguments = {
      oldText: "Full stack developer",
      path: "src/components/Hero.jsx",
    };
    const validationError = replaceSchema.safeParse(invalidArguments).error;

    replaceToolExecuteMock
      .mockRejectedValueOnce(validationError)
      .mockResolvedValueOnce({
        newText: "Full stack + AI engineer",
        oldText: "Full stack developer",
        path: "src/components/Hero.jsx",
        session: mockSession,
        startLine: 148,
      });

    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll update the hero title.",
          toolCalls: [
            createToolCall(
              "replace_in_file",
              invalidArguments,
              "call-malformed-replace",
            ),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll retry with every required field.",
          toolCalls: [
            createToolCall(
              "replace_in_file",
              {
                ...invalidArguments,
                newText: "Full stack + AI engineer",
              },
              "call-corrected-replace",
            ),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Done. I updated the hero title.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "Updated the hero title after correcting the tool call.",
            status: "completed",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);
    const repairCall = getModelCall(1);
    const repairPrompt = repairCall?.messages.find(
      (message) =>
        message.role === "user" &&
        message.content.includes("invalid arguments and was not executed"),
    );

    expect(result).toMatchObject({
      filesTouched: ["src/components/Hero.jsx"],
      status: "completed",
      stepsUsed: 4,
    });
    expect(repairCall?.toolChoice).toEqual({
      function: { name: "replace_in_file" },
      type: "function",
    });
    expect(repairPrompt).toMatchObject({ role: "user" });
    expect(repairPrompt?.content).toContain(
      "invalid arguments and was not executed",
    );
    expect(repairPrompt?.content).toContain("include every required field");
    expect(replaceToolExecuteMock).toHaveBeenCalledTimes(2);
  });

  it("does not force more than one focused retry for repeated malformed arguments", async () => {
    const invalidArguments = {
      oldText: "Full stack developer",
      path: "src/components/Hero.jsx",
    };
    const validationError = z
      .object({
        newText: z.string(),
        oldText: z.string(),
        path: z.string(),
      })
      .safeParse(invalidArguments).error;

    replaceToolExecuteMock.mockRejectedValue(validationError);

    for (let index = 0; index < 3; index += 1) {
      generateTextMock.mockResolvedValueOnce(
        createModelResponse({
          text: "I'll retry the replacement.",
          toolCalls: [
            createToolCall(
              "replace_in_file",
              invalidArguments,
              `call-malformed-${index}`,
            ),
          ],
        }),
      );
    }
    generateTextMock.mockResolvedValueOnce(
      createModelResponse({
        text: JSON.stringify({
          message: "I could not produce valid replacement arguments.",
          status: "blocked",
        }),
      }),
    );

    const result = await runSandboxAgent(baseInput);

    expect(result).toMatchObject({
      failureCode: "tool_retry_exhausted",
      status: "blocked",
      stepsUsed: 4,
    });
    expect(getModelCall(0)?.toolChoice).toBe("auto");
    expect(getModelCall(1)?.toolChoice).toEqual({
      function: { name: "replace_in_file" },
      type: "function",
    });
    expect(getModelCall(2)?.toolChoice).toBe("auto");
    expect(replaceToolExecuteMock).toHaveBeenCalledTimes(3);
  });

  it("keeps write_file as a single-call turn", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll update the projects data now.",
          toolCalls: [
            createToolCall(
              "write_file",
              {
                content: "export const projects = [];",
                path: "src/data/projects.js",
              },
              "call-write",
            ),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Done. I updated the projects data.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "Updated the projects data.",
            status: "completed",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);

    expect(result).toMatchObject({
      filesTouched: ["src/data/projects.js"],
      message: "Updated the projects data.",
      session: mockSession,
      status: "completed",
      stepsUsed: 3,
    });
    expect(writeToolExecuteMock).toHaveBeenCalledWith(
      {
        content: "export const projects = [];",
        path: "src/data/projects.js",
      },
      {
        sessionId: "session-test",
      },
    );
  });

  it("uses the structured finish message when the first tool turn has no tool calls", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Nothing needed to change. The existing implementation already matches the request.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "Schema finish message.",
            status: "completed",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);

    expect(result).toMatchObject({
      filesTouched: [],
      message: "Schema finish message.",
      session: mockSession,
      status: "completed",
      stepsUsed: 2,
    });
    expect(getModelCall(1)?.messages.at(-1)).toMatchObject({
      content: expectedFinishPrompt,
      role: "user",
    });
  });

  it("uses the finish-turn message when no-tool completion text is empty", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "   ",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "Nothing needed to change.",
            status: "completed",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);

    expect(result).toMatchObject({
      message: "Nothing needed to change.",
      status: "completed",
      stepsUsed: 2,
    });
  });

  it("uses structured blocked message and clarification from the finish turn", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I need one more detail before changing code.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            clarificationQuestion: "Which component should I update?",
            message: "Schema blocked message.",
            status: "blocked",
          }),
        }),
      );

    const result = await runSandboxAgent(baseInput);

    expect(result).toMatchObject({
      clarificationQuestion: "Which component should I update?",
      message: "Schema blocked message.",
      status: "blocked",
      stepsUsed: 2,
    });
  });

  it("feeds an unknown tool request back to the model and lets it retry", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll call a tool that does not exist.",
          toolCalls: [createToolCall("unknown_tool", {}, "call-unknown")],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "I'll use an available tool instead.",
          toolCalls: [
            createToolCall("list_directory", { path: "." }, "call-list"),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "Done inspecting.",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: JSON.stringify({
            message: "I recovered by using an available tool.",
            status: "completed",
          }),
        }),
      );

    listToolExecuteMock.mockResolvedValueOnce([
      {
        name: "src",
        path: "src",
        type: "dir",
      },
    ]);

    const result = await runSandboxAgent(baseInput);
    const finalMessages = getFinalModelMessages();
    const toolMessages = getToolMessages(finalMessages);

    expect(result).toMatchObject({
      message: "I recovered by using an available tool.",
      status: "completed",
      stepsUsed: 4,
    });
    expect(generateTextMock).toHaveBeenCalledTimes(4);
    expect(listToolExecuteMock).toHaveBeenCalledTimes(1);
    expect(toolMessages).toHaveLength(2);
    expect(parseToolMessage(toolMessages[0]!)).toMatchObject({
      arguments: {},
      code: "unknown_tool",
      ok: false,
      retryable: true,
      tool: "unknown_tool",
    });
    expect(parseToolMessage(toolMessages[0]!).message).toContain(
      "Use one of the available tools instead",
    );
  });

  it("fails when the finish response is not valid JSON", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        createModelResponse({
          text: "",
        }),
      )
      .mockResolvedValueOnce(
        createModelResponse({
          text: "not json",
        }),
      );

    const result = await runSandboxAgent(baseInput);

    expect(result).toMatchObject({
      failureCode: "internal_error",
      message: "The agent returned an invalid completion response.",
      status: "failed",
      stepsUsed: 2,
    });
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });
});
