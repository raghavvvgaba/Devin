import "server-only";

import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";
import { z } from "zod";

import type {
  AIUsage,
  AIMessage,
  AIToolChoice,
  AIToolCall,
  AIGenerateTextResult,
} from "~/server/ai/types";
import { aiProvider, aiProviderName } from "~/server/ai/provider";
import {
  buildToolProgressMessage,
  shouldShowModelProgressText,
  type SandboxAgentProgressHandler,
} from "~/server/sandbox/agent-progress";
import {
  collectToolPaths,
  parseToolArgumentsForTrace,
  parseToolResultForTrace,
  sanitizeTracePayload,
  sanitizeToolArguments,
  toTracePreview,
  type SandboxAgentTraceEvent,
  type SandboxAgentTraceHandler,
} from "~/server/sandbox/agent-trace";
import {
  buildSandboxAgentModelTools,
} from "~/server/sandbox/tools/model-tools";
import {
  getSandboxAgentTool,
  type SandboxAgentToolName,
} from "~/server/sandbox/tools/registry";
import {
  SandboxAgentToolError,
  type SandboxAgentToolTraceAttributes,
} from "~/server/sandbox/tools/types";
import { sandboxProvider } from "~/server/sandbox/provider";
import { IncrementalJsonStringField } from "~/server/sandbox/incremental-json-string";
import type {
  SandboxAgentInput,
  SandboxAgentMode,
  SandboxAgentResult,
  SandboxFile,
  SandboxFileEntry,
  SandboxGlobResult,
  SandboxSearchResult,
  SandboxSession,
} from "~/server/sandbox/types";

import AGENT_FINISH_PROMPT_TEMPLATE from "./prompts/agent-finish.txt";
import AGENT_MULTITOOL_RETRY_PROMPT_TEMPLATE from "./prompts/agent-multitool-retry.txt";
import AGENT_SYSTEM_PROMPT_TEMPLATE from "./prompts/agent-system.txt";
import AGENT_TERMINAL_FAILURE_FINISH_PROMPT_TEMPLATE from "./prompts/agent-terminal-failure-finish.txt";

const MAX_RECENT_EVENTS = 5;
const MAX_LIST_DIRECTORY_ENTRIES = 40;
const MAX_AGENT_MESSAGE_LENGTH = 1_200;
const MAX_READ_ONLY_TOOL_CALLS = 5;
const MAX_WRITE_TOOL_CALLS = 3;
const MAX_RECOVERY_TURNS = 5;
const MAX_SAME_FAILURE_REPEATS = 3;

const sandboxAgentTracer = trace.getTracer("inlaya.sandbox-agent");

const sandboxAgentModelTools = buildSandboxAgentModelTools();
const sandboxAgentToolIds = sandboxAgentModelTools.map(
  (tool) => tool.function.name,
) as SandboxAgentToolName[];
const READ_ONLY_TOOL_NAMES = new Set<SandboxAgentToolName>([
  "glob_files",
  "list_directory",
  "read_file",
  "search_code",
]);
const WRITE_TOOL_NAMES = new Set<SandboxAgentToolName>([
  "replace_in_file",
  "write_file",
]);

const finishSchema = z.object({
  clarificationQuestion: z.string().trim().min(1).max(240).optional(),
  message: z.string().trim().min(1).max(MAX_AGENT_MESSAGE_LENGTH),
  status: z.enum(["completed", "blocked"]),
});

type AgentFailureCode =
  | "internal_error"
  | "model_rate_limited"
  | "model_unavailable"
  | "sandbox_not_running"
  | "tool_retry_exhausted";

type SandboxAgentInternalResult = SandboxAgentResult & {
  failureCode?: AgentFailureCode;
};

type AgentRunState = {
  filesTouched: Set<string>;
  lastFailureSignature?: string;
  latestObservation: string;
  latestSession?: SandboxSession;
  recentEvents: string[];
  recoveryTurnsUsed: number;
  sameFailureRepeatCount: number;
  pendingArgumentRepairTool?: SandboxAgentToolName;
  stepsUsed: number;
  transcript: AIMessage[];
  usage?: AIUsage;
};

type AgentToolSuccess = {
  latestObservation: string;
  recentEvent: string;
  session?: SandboxSession;
  toolMessageContent: string;
  touchedPath?: string;
};

type AgentToolFailure = {
  argumentValidationFailure: boolean;
  code: string;
  details?: Record<string, unknown>;
  latestObservation: string;
  message: string;
  recentEvent: string;
  status: "tool_failure";
  tool: string;
  toolMessageContent: string;
  traceAttributes?: SandboxAgentToolTraceAttributes;
};

type AgentToolSkipped = {
  code: "skipped_due_to_prior_write_failure";
  latestObservation: string;
  message: string;
  recentEvent: string;
  status: "tool_skipped";
  tool: string;
  toolMessageContent: string;
};

type AgentToolInternalFatalFailure = {
  code: AgentFailureCode;
  message: string;
  recentEvent: string;
  status: "internal_fatal_failure";
};

type AgentToolCallResult =
  | ({ status: "ok" } & AgentToolSuccess)
  | AgentToolFailure
  | AgentToolInternalFatalFailure;

type AgentToolExecutionResult = AgentToolCallResult | AgentToolSkipped;

type AgentModelPhase = "tool" | "finish";

type AgentToolExecutionOptions = {
  deferPreviewRecovery?: boolean;
};

type ToolTurnClassification =
  | {
      status: "finish";
    }
  | {
      status: "single";
      toolCalls: [AIToolCall];
    }
  | {
      status: "read_only_batch";
      toolCalls: AIToolCall[];
    }
  | {
      status: "write_batch";
      toolCalls: AIToolCall[];
    }
  | {
      code: "invalid_tool_batch" | "write_batch_limit_exceeded";
      reason: string;
      status: "invalid_batch";
      toolCalls: AIToolCall[];
    };

type ExecutedAgentTool = {
  durationMs: number;
  result: AgentToolExecutionResult;
  toolCall: AIToolCall;
};

type AgentToolBatchResult =
  | {
      executed: ExecutedAgentTool[];
      latestObservation: string;
      latestSession?: SandboxSession;
      status: "ok" | "tool_failure";
      touchedPaths: string[];
    }
  | {
      code: AgentFailureCode;
      executed: ExecutedAgentTool[];
      latestObservation: string;
      latestSession?: SandboxSession;
      message: string;
      status: "internal_fatal_failure";
      touchedPaths: string[];
    };

type RunSandboxAgentOptions = {
  onFinalTextDelta?: (delta: string) => Promise<void> | void;
  onProgress?: SandboxAgentProgressHandler;
  onTrace?: SandboxAgentTraceHandler;
};

type RunSandboxAgentLoopOptions = RunSandboxAgentOptions & {
  agentRunSpan: Span;
};

type AgentModelTraceSummary = {
  hasText: boolean;
  textPreview: string | null;
  toolCalls: Array<{
    arguments: Record<string, unknown>;
    argumentsPreview: string;
    id: string;
    name: string;
  }>;
};

type AgentToolTraceSummary = {
  arguments: Record<string, unknown>;
  argumentsPreview: string;
  latestObservationPreview: string | null;
  paths: string[];
  resultPreview: string | null;
};

function buildAgentModelTraceSummary(
  response: AIGenerateTextResult,
): AgentModelTraceSummary {
  return {
    hasText: Boolean(response.text.trim()),
    textPreview: response.text.trim()
      ? toTracePreview(response.text, 220)
      : null,
    toolCalls:
      response.toolCalls?.map((toolCall) => {
        const argumentsValue = parseToolArgumentsForTrace(
          toolCall.function.arguments,
        );
        const safeArguments = sanitizeToolArguments(
          toolCall.function.name,
          argumentsValue,
        );

        return {
          arguments: safeArguments,
          argumentsPreview: toTracePreview(
            JSON.stringify(safeArguments),
            160,
          ),
          id: toolCall.id,
          name: toolCall.function.name,
        };
      }) ?? [],
  };
}

function buildAgentToolTraceSummary(
  toolCall: AIToolCall,
  result: AgentToolExecutionResult,
): AgentToolTraceSummary {
  const argumentsValue = parseToolArgumentsForTrace(
    toolCall.function.arguments,
  );
  const safeArguments = sanitizeToolArguments(
    toolCall.function.name,
    argumentsValue,
  );
  const toolMessageContent =
    "toolMessageContent" in result ? result.toolMessageContent : undefined;
  const resultValue = parseToolResultForTrace(toolMessageContent);
  const safeResult = sanitizeTracePayload({ result: resultValue }).result;

  return {
    arguments: safeArguments,
    argumentsPreview: toTracePreview(JSON.stringify(safeArguments), 160),
    latestObservationPreview:
      "latestObservation" in result
        ? toTracePreview(result.latestObservation, 220)
        : null,
    paths: collectToolPaths({
      argumentsValue,
      resultValue,
      touchedPath: "touchedPath" in result ? result.touchedPath : undefined,
    }),
    resultPreview:
      safeResult === undefined
        ? null
        : toTracePreview(JSON.stringify(safeResult), 220),
  };
}

function recordAgentRunSpanResult(
  span: Span,
  result: SandboxAgentInternalResult,
) {
  span.setAttributes({
    "agent.files_touched_count": result.filesTouched.length,
    "agent.status": result.status,
    "agent.steps_used": result.stepsUsed,
  });

  if (result.failureCode) {
    span.setAttribute("agent.failure_code", result.failureCode);
  }

  if (result.usage) {
    span.setAttributes({
      "gen_ai.usage.input_tokens": result.usage.promptTokens,
      "gen_ai.usage.output_tokens": result.usage.completionTokens,
      "gen_ai.usage.total_tokens": result.usage.totalTokens,
    });

    if (result.usage.reasoningTokens !== undefined) {
      span.setAttribute(
        "gen_ai.usage.reasoning_tokens",
        result.usage.reasoningTokens,
      );
    }

    if (result.usage.cost !== undefined) {
      span.setAttribute("agent.cost_usd", result.usage.cost);
    }
  }

  span.setStatus({
    code:
      result.status === "failed" ? SpanStatusCode.ERROR : SpanStatusCode.OK,
  });
}

function hasToolMessageContent(
  result: AgentToolExecutionResult,
): result is Exclude<AgentToolExecutionResult, AgentToolInternalFatalFailure> {
  return "toolMessageContent" in result;
}

type AgentRetryExhaustedResult = {
  code: AgentFailureCode;
  latestObservation: string;
  message: string;
  recentEvent: string;
  toolMessageContent: string;
};

type ToolFailureMessageInput = {
  argumentsValue: Record<string, unknown>;
  code: string;
  details?: Record<string, unknown>;
  message: string;
  retryable: boolean;
  tool: string;
};

type ToolFailureResultOptions = {
  code?: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
  traceAttributes?: SandboxAgentToolTraceAttributes;
};

function previewText(value: string, maxLength = 220) {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function pushRecentEvent(state: AgentRunState, event: string) {
  state.recentEvents.push(event);

  if (state.recentEvents.length > MAX_RECENT_EVENTS) {
    state.recentEvents.shift();
  }
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

function buildAgentSystemPrompt(mode: SandboxAgentMode) {
  return formatPromptTemplate(AGENT_SYSTEM_PROMPT_TEMPLATE, {
    AGENT_MODE: mode,
    MAX_READ_ONLY_TOOL_CALLS: String(MAX_READ_ONLY_TOOL_CALLS),
    MODE_INSTRUCTIONS:
      mode === "plan"
        ? [
            "Plan mode is read-only. Use repository tools to answer questions, investigate, review, or prepare an actionable implementation plan.",
            "If the user requests implementation, do not claim to have changed files. Finish with the plan and tell them to switch to Build mode when they want it applied.",
            "Never switch modes yourself.",
          ].join(" ")
        : [
            "Build mode permits file edits, but only when the user's instruction explicitly requests a change.",
            "Questions and explanations do not authorize edits. Never switch modes yourself.",
          ].join(" "),
  });
}

function buildAgentFinishPrompt(mode: SandboxAgentMode) {
  return formatPromptTemplate(AGENT_FINISH_PROMPT_TEMPLATE, {
    MODE_FINISH_INSTRUCTION:
      mode === "plan"
        ? "If the user requested implementation, summarize the actionable plan and tell them to switch to Build mode to apply it. Do not claim files were changed."
        : "Report only changes that were actually completed.",
  });
}

function buildTerminalFailureFinishPrompt() {
  return formatPromptTemplate(AGENT_TERMINAL_FAILURE_FINISH_PROMPT_TEMPLATE);
}

function buildMultiToolRetryPrompt() {
  return formatPromptTemplate(AGENT_MULTITOOL_RETRY_PROMPT_TEMPLATE, {
    MAX_READ_ONLY_TOOL_CALLS: String(MAX_READ_ONLY_TOOL_CALLS),
  });
}

function buildAgentUserPrompt(input: SandboxAgentInput) {
  return [
    `Repository: ${input.repoOwner}/${input.repoName}`,
    `Project id: ${input.projectId}`,
    `Issue #${input.issueNumber}: ${input.issueTitle}`,
    `Active mode: ${input.mode}`,
    "",
    "User instruction:",
    input.userInstruction,
    "",
    "When you are done or blocked, return JSON with:",
    '- "status": "completed" or "blocked"',
    '- "message": concise user-facing result or implementation plan',
    '- "clarificationQuestion": optional follow-up question when blocked',
  ].join("\n");
}

function formatSearchResult(result: SandboxSearchResult) {
  if (result.matches.length === 0) {
    return [
      "search_code returned no matches.",
      `truncated: ${result.truncated ? "true" : "false"}`,
    ].join("\n");
  }

  return [
    "search_code matches:",
    ...result.matches.map(
      (match) =>
        `- ${match.path}:${match.line}:${match.column} ${match.text}`,
    ),
    `truncated: ${result.truncated ? "true" : "false"}`,
  ].join("\n");
}

function formatGlobResult(result: SandboxGlobResult) {
  return [
    result.paths.length === 0
      ? "glob_files returned no paths."
      : "glob_files paths:",
    ...result.paths.map((path) => `- ${path}`),
    `truncated: ${result.truncated ? "true" : "false"}`,
  ].join("\n");
}

function formatDirectoryEntries(entries: SandboxFileEntry[]) {
  const visibleEntries = entries.slice(0, MAX_LIST_DIRECTORY_ENTRIES);

  return [
    "list_directory entries:",
    ...visibleEntries.map((entry) => `- [${entry.type}] ${entry.path}`),
    ...(entries.length > visibleEntries.length
      ? [`- ...and ${entries.length - visibleEntries.length} more entries.`]
      : []),
  ].join("\n");
}

function formatReadFileResult(file: SandboxFile) {
  return [
    `read_file path: ${file.path}`,
    `lines: ${file.startLine}-${file.endLine} of ${file.totalLines}`,
    `truncated: ${file.truncated ? "true" : "false"}`,
    "content:",
    "```",
    file.content,
    "```",
  ].join("\n");
}

function normalizeToolErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "unknown_tool_error";
}

function buildToolFailureMessageContent(input: ToolFailureMessageInput) {
  return JSON.stringify({
    arguments: input.argumentsValue,
    code: input.code,
    ...(input.details ? { details: input.details } : {}),
    message: input.message,
    ok: false,
    retryable: input.retryable,
    tool: input.tool,
  });
}

function buildToolFailureResult(
  tool: SandboxAgentToolName,
  message: string,
  argumentsValue: Record<string, unknown>,
  argumentValidationFailure = false,
  options: ToolFailureResultOptions = {},
): AgentToolFailure {
  const code = options.code ?? message;

  return {
    argumentValidationFailure,
    code,
    ...(options.details ? { details: options.details } : {}),
    latestObservation: formatToolFeedback(tool, message),
    message,
    recentEvent: `${tool} failed: ${message}.`,
    status: "tool_failure",
    tool,
    toolMessageContent: buildToolFailureMessageContent({
      argumentsValue,
      code,
      details: options.details,
      message,
      retryable: options.retryable ?? true,
      tool,
    }),
    ...(options.traceAttributes
      ? { traceAttributes: options.traceAttributes }
      : {}),
  };
}

function buildRejectedToolCallResult(
  toolCall: AIToolCall,
  code: "invalid_tool_batch" | "write_batch_limit_exceeded",
  message: string,
): AgentToolFailure {
  const tool = toolCall.function.name;
  const argumentsValue = parseToolCallArguments(toolCall);

  return {
    argumentValidationFailure: false,
    code,
    latestObservation: formatToolFeedback(tool, message),
    message,
    recentEvent: `${tool} was rejected: ${message}`,
    status: "tool_failure",
    tool,
    toolMessageContent: buildToolFailureMessageContent({
      argumentsValue,
      code,
      message,
      retryable: true,
      tool,
    }),
  };
}

function buildSkippedWriteResult(
  toolCall: AIToolCall,
  failedToolCall: AIToolCall,
): AgentToolSkipped {
  const code = "skipped_due_to_prior_write_failure";
  const tool = toolCall.function.name;
  const message = `This write was not executed because the earlier write ${failedToolCall.id} failed. Request this write again together with the failed write.`;

  return {
    code,
    latestObservation: `${tool} was skipped after ${failedToolCall.function.name} failed.`,
    message,
    recentEvent: `${tool} was skipped because an earlier write failed.`,
    status: "tool_skipped",
    tool,
    toolMessageContent: buildToolFailureMessageContent({
      argumentsValue: parseToolCallArguments(toolCall),
      code,
      message,
      retryable: true,
      tool,
    }),
  };
}

function buildPlanModeWriteFailureResult(
  tool: SandboxAgentToolName,
  argumentsValue: Record<string, unknown>,
): AgentToolFailure {
  const code = "write_not_allowed_in_plan_mode";
  const message =
    "This workspace is in Plan mode. File edits are unavailable. Do not retry the write. Continue with read-only analysis and tell the user to switch to Build mode when they want the changes applied.";

  return {
    argumentValidationFailure: false,
    code,
    latestObservation: formatToolFeedback(tool, message),
    message,
    recentEvent: `${tool} was denied because Plan mode is read-only.`,
    status: "tool_failure",
    tool,
    toolMessageContent: buildToolFailureMessageContent({
      argumentsValue,
      code,
      message,
      retryable: true,
      tool,
    }),
  };
}

function mapModelError(error: unknown): {
  code: AgentFailureCode;
  message: string;
} {
  const message = error instanceof Error ? error.message : "";

  if (
    message.includes("OPENROUTER_API_KEY") ||
    message.includes("authentication failed") ||
    message.includes("model is not configured")
  ) {
    return {
      code: "model_unavailable",
      message: "The AI model is not available right now.",
    };
  }

  if (message.includes("rate limited")) {
    return {
      code: "model_rate_limited",
      message: "The AI model is rate limited right now. Please try again.",
    };
  }

  return {
    code: "internal_error",
    message: "The agent could not continue because the model request failed.",
  };
}

async function traceAgentModelRequest(input: {
  generate: () => Promise<AIGenerateTextResult>;
  parentSpan: Span;
  phase: AgentModelPhase;
  requestedModel?: string;
  step: number;
}) {
  const spanName = input.requestedModel
    ? `chat ${input.requestedModel}`
    : "chat";

  return sandboxAgentTracer.startActiveSpan(
    spanName,
    {
      attributes: {
        "agent.phase": input.phase,
        "agent.step": input.step,
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": aiProviderName,
        ...(input.requestedModel
          ? { "gen_ai.request.model": input.requestedModel }
          : {}),
      },
      kind: SpanKind.CLIENT,
    },
    trace.setSpan(context.active(), input.parentSpan),
    async (span) => {
      try {
        const response = await input.generate();
        const summary = buildAgentModelTraceSummary(response);

        span.updateName(`chat ${response.model}`);
        span.setAttributes({
          "agent.model.has_text": summary.hasText,
          "agent.model.status": "completed",
          "agent.model.tool_call_count": summary.toolCalls.length,
          "gen_ai.response.model": response.model,
        });

        if (summary.textPreview) {
          span.setAttribute(
            "agent.model.response_preview",
            summary.textPreview,
          );
        }

        if (summary.toolCalls.length > 0) {
          span.setAttribute(
            "agent.model.tool_calls_preview",
            toTracePreview(JSON.stringify(summary.toolCalls), 500),
          );
        }

        if (response.usage) {
          span.setAttributes({
            "gen_ai.usage.input_tokens": response.usage.promptTokens,
            "gen_ai.usage.output_tokens": response.usage.completionTokens,
            "gen_ai.usage.total_tokens": response.usage.totalTokens,
          });

          if (response.usage.reasoningTokens !== undefined) {
            span.setAttribute(
              "gen_ai.usage.reasoning.output_tokens",
              response.usage.reasoningTokens,
            );
          }

          if (response.usage.cost !== undefined) {
            span.setAttribute("agent.cost_usd", response.usage.cost);
          }
        }

        if (response.timeToFirstOutputMs !== undefined) {
          span.setAttribute(
            "agent.model.time_to_first_visible_delta_ms",
            response.timeToFirstOutputMs,
          );
        }

        span.setStatus({ code: SpanStatusCode.OK });
        return response;
      } catch (error) {
        const exception =
          error instanceof Error ? error : new Error(String(error));
        const mappedError = mapModelError(error);

        span.recordException(exception);
        span.setAttributes({
          "agent.model.status": "failed",
          "error.type": mappedError.code,
        });
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: mappedError.message,
        });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

function isSandboxAgentToolName(value: string): value is SandboxAgentToolName {
  return sandboxAgentToolIds.includes(value as SandboxAgentToolName);
}

function formatToolFeedback(tool: string, message: string) {
  return [
    `The previous ${tool} call failed.`,
    `Error: ${message}`,
    "Fix the tool arguments or choose a different next step.",
  ].join("\n");
}

function buildFailureSignature(
  tool: string,
  code: string,
  argumentsValue: Record<string, unknown>,
) {
  return `${tool}:${code}:${JSON.stringify(argumentsValue)}`;
}

function buildFailureTurnSignature(signatures: string[]) {
  return Array.from(new Set(signatures)).sort().join("||");
}

function parseToolCallArguments(toolCall: AIToolCall): Record<string, unknown> {
  try {
    return JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
  } catch {
    return { _raw: toolCall.function.arguments };
  }
}

async function emitProgress(
  onProgress: SandboxAgentProgressHandler | undefined,
  message: string,
) {
  if (!message.trim()) {
    return;
  }

  await onProgress?.({
    message,
    type: "progress",
  });
}

async function emitModelProgress(
  onProgress: SandboxAgentProgressHandler | undefined,
  response: AIGenerateTextResult,
) {
  if (
    response.toolCalls?.length &&
    shouldShowModelProgressText(response.text)
  ) {
    await emitProgress(onProgress, response.text.trim());
  }
}

async function emitToolProgress(
  onProgress: SandboxAgentProgressHandler | undefined,
  toolCall: AIToolCall,
) {
  await emitProgress(
    onProgress,
    buildToolProgressMessage(
      toolCall.function.name,
      parseToolCallArguments(toolCall),
    ),
  );
}

function buildRetryExhaustedResult(
  tool: string,
  argumentsValue: Record<string, unknown>,
): AgentRetryExhaustedResult {
  return {
    code: "tool_retry_exhausted",
    latestObservation: [
      `The previous ${tool} call could not be recovered after several retries.`,
      "Stop using tools and explain the repeated failure to the user.",
    ].join("\n"),
    message: "The agent could not recover from a repeated tool error.",
    recentEvent: `The recovery budget was exhausted for ${tool}.`,
    toolMessageContent: buildToolFailureMessageContent({
      argumentsValue,
      code: "tool_retry_exhausted",
      message: "The agent could not recover from a repeated tool error.",
      retryable: false,
      tool,
    }),
  };
}

function buildUnknownToolFailureResult(
  toolName: string,
  argumentsValue: Record<string, unknown>,
): AgentToolFailure {
  const availableTools = sandboxAgentToolIds.join(", ");
  const message = `The "${toolName}" tool does not exist. Use one of the available tools instead: ${availableTools}.`;

  return {
    argumentValidationFailure: false,
    code: "unknown_tool",
    latestObservation: [
      `The previous ${toolName} call failed.`,
      `Error: ${message}`,
      "Choose one of the available tools and continue if possible.",
    ].join("\n"),
    message,
    recentEvent: `Unknown tool requested: ${toolName}.`,
    status: "tool_failure",
    tool: toolName,
    toolMessageContent: buildToolFailureMessageContent({
      argumentsValue,
      code: "unknown_tool",
      message,
      retryable: true,
      tool: toolName,
    }),
  };
}

async function emitAgentTrace(
  handler: SandboxAgentTraceHandler | undefined,
  event: SandboxAgentTraceEvent,
) {
  if (!handler) {
    return;
  }

  try {
    await handler(event);
  } catch (error) {
    console.error("Sandbox agent trace handler failed:", error);
  }
}

async function recordAgentModelResponse(
  input: SandboxAgentInput,
  phase: AgentModelPhase,
  step: number,
  response: AIGenerateTextResult,
  durationMs: number,
  options: RunSandboxAgentOptions,
) {
  const summary = buildAgentModelTraceSummary(response);

  await emitAgentTrace(options.onTrace, {
    durationMs,
    model: response.model,
    payload: {
      hasText: summary.hasText,
      textPreview: summary.textPreview,
      toolCalls: summary.toolCalls,
    },
    phase,
    status: "completed",
    step,
    type: "model_response",
    usage: response.usage,
  });

  console.log("Sandbox agent model response:", {
    durationMs,
    hasText: summary.hasText,
    issueNumber: input.issueNumber,
    model: response.model,
    phase,
    projectId: input.projectId,
    step,
    textPreview: summary.textPreview,
    toolCalls: summary.toolCalls,
    usage: response.usage,
  });
}

async function recordAgentToolResult(
  input: SandboxAgentInput,
  step: number,
  toolCall: AIToolCall,
  result: AgentToolExecutionResult,
  durationMs: number,
  options: RunSandboxAgentOptions,
) {
  const summary = buildAgentToolTraceSummary(toolCall, result);

  await emitAgentTrace(options.onTrace, {
    durationMs,
    level: result.status === "ok" ? "info" : "warn",
    paths: summary.paths,
    payload: {
      arguments: summary.arguments,
      argumentsPreview: summary.argumentsPreview,
      code: "code" in result ? result.code : undefined,
      details: "details" in result ? result.details : undefined,
      latestObservationPreview: summary.latestObservationPreview,
      message: "message" in result ? result.message : undefined,
      recentEvent: result.recentEvent,
      toolMessagePreview: summary.resultPreview,
    },
    status: result.status,
    step,
    toolCallId: toolCall.id,
    toolName: toolCall.function.name,
    type: "tool_result",
  });

  console.log("Sandbox agent tool result:", {
    durationMs,
    issueNumber: input.issueNumber,
    latestObservationPreview: summary.latestObservationPreview,
    paths: summary.paths,
    projectId: input.projectId,
    recentEvent: result.recentEvent,
    status: result.status,
    step,
    tool: toolCall.function.name,
    toolArgumentsPreview: summary.argumentsPreview,
    toolMessagePreview: summary.resultPreview,
  });
}

function buildFinishResponseSchema() {
  return {
    additionalProperties: false,
    properties: {
      clarificationQuestion: {
        maxLength: 240,
        minLength: 1,
        type: "string",
      },
      message: {
        maxLength: MAX_AGENT_MESSAGE_LENGTH,
        minLength: 1,
        type: "string",
      },
      status: {
        enum: ["completed", "blocked"],
      },
    },
    required: ["status", "message"],
    type: "object",
  } as const;
}

function parseFinishResponse(text: string) {
  return finishSchema.parse(JSON.parse(text));
}

function classifyToolTurn(response: AIGenerateTextResult): ToolTurnClassification {
  const toolCalls = response.toolCalls ?? [];

  if (toolCalls.length === 0) {
    return {
      status: "finish",
    };
  }

  if (toolCalls.length === 1) {
    return {
      status: "single",
      toolCalls: [toolCalls[0]!],
    };
  }

  const allReadOnly = toolCalls.every((toolCall) =>
    READ_ONLY_TOOL_NAMES.has(toolCall.function.name as SandboxAgentToolName),
  );
  const allWrites = toolCalls.every((toolCall) =>
    WRITE_TOOL_NAMES.has(toolCall.function.name as SandboxAgentToolName),
  );

  if (allReadOnly && toolCalls.length <= MAX_READ_ONLY_TOOL_CALLS) {
    return {
      status: "read_only_batch",
      toolCalls,
    };
  }

  if (allWrites && toolCalls.length <= MAX_WRITE_TOOL_CALLS) {
    return {
      status: "write_batch",
      toolCalls,
    };
  }

  return {
    code:
      allWrites && toolCalls.length > MAX_WRITE_TOOL_CALLS
        ? "write_batch_limit_exceeded"
        : "invalid_tool_batch",
    reason: allReadOnly
      ? `Too many read-only tool calls were returned (${toolCalls.length}; maximum ${MAX_READ_ONLY_TOOL_CALLS}).`
      : allWrites
        ? `Too many write tool calls were returned (${toolCalls.length}; maximum ${MAX_WRITE_TOOL_CALLS}).`
        : "Read-only and write-like tools cannot be mixed in one response.",
    status: "invalid_batch",
    toolCalls,
  };
}

function mergeUsage(previous: AIUsage | undefined, next: AIUsage | undefined) {
  if (!next) {
    return previous;
  }

  return {
    completionTokens: (previous?.completionTokens ?? 0) + next.completionTokens,
    cost:
      previous?.cost === undefined && next.cost === undefined
        ? undefined
        : (previous?.cost ?? 0) + (next.cost ?? 0),
    promptTokens: (previous?.promptTokens ?? 0) + next.promptTokens,
    reasoningTokens:
      previous?.reasoningTokens === undefined && next.reasoningTokens === undefined
        ? undefined
        : (previous?.reasoningTokens ?? 0) + (next.reasoningTokens ?? 0),
    totalTokens: (previous?.totalTokens ?? 0) + next.totalTokens,
  };
}

async function callAgentToolTurn(
  state: AgentRunState,
  mode: SandboxAgentMode,
  parentSpan: Span,
  model?: string,
  step = state.stepsUsed + 1,
  toolChoice: AIToolChoice = "auto",
): Promise<AIGenerateTextResult> {
  const tools =
    mode === "plan"
      ? sandboxAgentModelTools.filter((tool) =>
          READ_ONLY_TOOL_NAMES.has(tool.function.name as SandboxAgentToolName),
        )
      : sandboxAgentModelTools;

  return traceAgentModelRequest({
    generate: () =>
      aiProvider.generateText({
        maxTokens: 3_000,
        messages: state.transcript,
        ...(model ? { model } : {}),
        temperature: 0.1,
        toolChoice,
        tools,
      }),
    parentSpan,
    phase: "tool",
    requestedModel: model,
    step,
  });
}

async function callAgentFinishTurn(
  state: AgentRunState,
  finishPrompt: string,
  parentSpan: Span,
  onFinalTextDelta?: RunSandboxAgentOptions["onFinalTextDelta"],
  model?: string,
  step = state.stepsUsed + 1,
): Promise<AIGenerateTextResult> {
  return traceAgentModelRequest({
    generate: async () => {
      const messageField = new IncrementalJsonStringField("message");
      const streamStartedAt = Date.now();
      let timeToFirstOutputMs: number | undefined;
      const response = await aiProvider.generateText({
        maxTokens: 1_500,
        messages: [
          ...state.transcript,
          {
            content: finishPrompt,
            role: "user",
          },
        ],
        ...(model ? { model } : {}),
        responseFormat: {
          type: "json_schema",
          jsonSchema: {
            name: "sandbox_agent_finish",
            schema: buildFinishResponseSchema(),
            strict: true,
          },
        },
        onTextDelta: async (rawDelta) => {
          const messageDelta = messageField.push(rawDelta);
          if (!messageDelta) return;

          timeToFirstOutputMs ??= Date.now() - streamStartedAt;
          await onFinalTextDelta?.(messageDelta);
        },
        stream: true,
        temperature: 0.1,
        toolChoice: "none",
      });

      return {
        ...response,
        ...(timeToFirstOutputMs !== undefined
          ? { timeToFirstOutputMs }
          : {}),
      };
    },
    parentSpan,
    phase: "finish",
    requestedModel: model,
    step,
  });
}

async function executeToolCallCore(
  toolCall: AIToolCall,
  sessionId: string,
  mode: SandboxAgentMode,
  options: AgentToolExecutionOptions = {},
): Promise<AgentToolCallResult> {
  if (!isSandboxAgentToolName(toolCall.function.name)) {
    return buildUnknownToolFailureResult(
      toolCall.function.name,
      parseToolCallArguments(toolCall),
    );
  }

  const toolName = toolCall.function.name;

  if (mode === "plan" && WRITE_TOOL_NAMES.has(toolName)) {
    return buildPlanModeWriteFailureResult(
      toolName,
      parseToolCallArguments(toolCall),
    );
  }

  const tool = getSandboxAgentTool(toolName);

  if (!tool) {
    return {
      code: "internal_error",
      message: "The agent could not continue because a sandbox tool was missing.",
      recentEvent: `A tool was requested but not found: ${toolName}`,
      status: "internal_fatal_failure",
    };
  }

  try {
    const parsedArguments = JSON.parse(toolCall.function.arguments) as Record<
      string,
      unknown
    >;
    const result = await tool.execute(parsedArguments, {
      ...(options.deferPreviewRecovery
        ? { deferPreviewRecovery: true }
        : {}),
      sessionId,
    });
    const toolMessageContent = JSON.stringify(result);

    switch (toolName) {
      case "glob_files":
        return {
          latestObservation: formatGlobResult(result as SandboxGlobResult),
          recentEvent: `Found files matching ${JSON.stringify(parsedArguments.patterns ?? [])}${typeof parsedArguments.path === "string" && parsedArguments.path ? ` in ${parsedArguments.path}` : ""}.`,
          status: "ok",
          toolMessageContent,
        };
      case "list_directory":
        return {
          latestObservation: formatDirectoryEntries(result as SandboxFileEntry[]),
          recentEvent: `Listed ${typeof parsedArguments.path === "string" && parsedArguments.path ? parsedArguments.path : "."}.`,
          status: "ok",
          toolMessageContent,
        };
      case "read_file": {
        const file = result as SandboxFile;

        return {
          latestObservation: formatReadFileResult(file),
          recentEvent: `Read ${file.path} lines ${file.startLine}-${file.endLine}.`,
          status: "ok",
          toolMessageContent,
          touchedPath: file.path,
        };
      }
      case "search_code":
        return {
          latestObservation: formatSearchResult(result as SandboxSearchResult),
          recentEvent: `Searched for ${JSON.stringify(typeof parsedArguments.query === "string" ? parsedArguments.query : "")}${typeof parsedArguments.path === "string" && parsedArguments.path ? ` in ${parsedArguments.path}` : ""}.`,
          status: "ok",
          toolMessageContent,
        };
      case "write_file": {
        const writeResult = result as {
          path: string;
          session: SandboxSession;
        };

        return {
          latestObservation: `write_file updated ${writeResult.path}.`,
          recentEvent: `Wrote ${writeResult.path}.`,
          session: writeResult.session,
          status: "ok",
          toolMessageContent,
          touchedPath: writeResult.path,
        };
      }
      case "replace_in_file": {
        const replaceResult = result as {
          path: string;
          session: SandboxSession;
          startLine: number;
        };

        return {
          latestObservation: `replace_in_file updated ${replaceResult.path} line ${replaceResult.startLine}.`,
          recentEvent: `Replaced text in ${replaceResult.path} line ${replaceResult.startLine}.`,
          session: replaceResult.session,
          status: "ok",
          toolMessageContent,
          touchedPath: replaceResult.path,
        };
      }
    }

    return {
      code: "internal_error",
      message: "The agent could not continue because a sandbox tool was not handled.",
      recentEvent: `A tool completed but had no formatter: ${toolName}`,
      status: "internal_fatal_failure",
    };
  } catch (error) {
    const argumentValidationFailure =
      error instanceof SyntaxError || error instanceof z.ZodError;
    const structuredToolError =
      error instanceof SandboxAgentToolError ? error : undefined;
    const argumentsValue =
      error instanceof SyntaxError
        ? { _raw: toolCall.function.arguments }
        : (structuredToolError?.safeArguments ??
          parseToolCallArguments(toolCall));
    const message =
      error instanceof SyntaxError
        ? "invalid_tool_arguments_json"
        : normalizeToolErrorMessage(error);

    return buildToolFailureResult(
      toolName,
      message,
      argumentsValue,
      argumentValidationFailure,
      structuredToolError
        ? {
            code: structuredToolError.code,
            details: structuredToolError.details,
            retryable: structuredToolError.retryable,
            traceAttributes: structuredToolError.traceAttributes,
          }
        : {},
    );
  }
}

async function executeToolCall(
  toolCall: AIToolCall,
  sessionId: string,
  mode: SandboxAgentMode,
  step: number,
  parentSpan: Span,
  options: AgentToolExecutionOptions = {},
): Promise<AgentToolCallResult> {
  const toolName = toolCall.function.name;
  const argumentsValue = parseToolArgumentsForTrace(
    toolCall.function.arguments,
  );
  const safeArguments = sanitizeToolArguments(toolName, argumentsValue);

  return sandboxAgentTracer.startActiveSpan(
    `execute_tool ${toolName}`,
    {
      attributes: {
        "agent.step": step,
        "agent.tool.arguments_preview": toTracePreview(
          JSON.stringify(safeArguments),
          160,
        ),
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.call.id": toolCall.id,
        "gen_ai.tool.name": toolName,
        "gen_ai.tool.type": "function",
      },
      kind: SpanKind.INTERNAL,
    },
    trace.setSpan(context.active(), parentSpan),
    async (span) => {
      try {
        const result = await executeToolCallCore(
          toolCall,
          sessionId,
          mode,
          options,
        );
        const summary = buildAgentToolTraceSummary(toolCall, result);

        span.setAttribute("agent.tool.status", result.status);

        if (
          result.status === "tool_failure" &&
          result.traceAttributes
        ) {
          span.setAttributes(result.traceAttributes);
        }

        if (summary.paths.length > 0) {
          span.setAttribute("agent.tool.paths", summary.paths);
        }

        if (summary.latestObservationPreview) {
          span.setAttribute(
            "agent.tool.observation_preview",
            summary.latestObservationPreview,
          );
        }

        if (summary.resultPreview) {
          span.setAttribute("agent.tool.result_preview", summary.resultPreview);
        }

        if (result.status === "ok") {
          span.setStatus({ code: SpanStatusCode.OK });
        } else {
          span.setAttribute("error.type", result.code);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: result.message,
          });
        }

        return result;
      } catch (error) {
        const exception =
          error instanceof Error ? error : new Error(String(error));

        span.recordException(exception);
        span.setAttributes({
          "agent.tool.status": "failed",
          "error.type": exception.name || "Error",
        });
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: toTracePreview(exception.message, 220),
        });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

async function resolveFinalSession(
  state: AgentRunState,
  sessionId: string,
): Promise<SandboxSession | undefined> {
  if (state.latestSession) {
    return state.latestSession;
  }

  try {
    return (await sandboxProvider.get(sessionId)) ?? undefined;
  } catch {
    return undefined;
  }
}

function appendToolMessages(
  state: AgentRunState,
  toolCalls: AIToolCall[],
  toolMessages: Array<{
    toolCallId: string;
    toolMessageContent: string;
  }>,
  assistantContent: string,
) {
  state.transcript.push({
    content: assistantContent,
    role: "assistant",
    tool_calls: toolCalls,
  });
  for (const toolMessage of toolMessages) {
    state.transcript.push({
      content: toolMessage.toolMessageContent,
      role: "tool",
      tool_call_id: toolMessage.toolCallId,
    });
  }
}

function appendAssistantMessage(state: AgentRunState, content: string) {
  if (!content.trim()) {
    return;
  }

  state.transcript.push({
    content,
    role: "assistant",
  });
}

function appendUserMessage(state: AgentRunState, content: string) {
  state.transcript.push({
    content,
    role: "user",
  });
}

function formatToolCallReference(toolCall: AIToolCall) {
  const argumentsValue = parseToolCallArguments(toolCall);
  const path =
    typeof argumentsValue.path === "string" ? ` at ${argumentsValue.path}` : "";

  return `${toolCall.id} (${toolCall.function.name}${path})`;
}

function buildWriteBatchRecoveryPrompt(executed: ExecutedAgentTool[]) {
  const succeeded = executed.filter((item) => item.result.status === "ok");
  const failed = executed.filter(
    (item) => item.result.status === "tool_failure",
  );
  const skipped = executed.filter(
    (item) => item.result.status === "tool_skipped",
  );

  return [
    "The write batch stopped at the first failed write.",
    succeeded.length > 0
      ? `Succeeded and must not be repeated: ${succeeded.map((item) => formatToolCallReference(item.toolCall)).join(", ")}.`
      : "No writes succeeded.",
    `Failed and must be requested again: ${failed.map((item) => formatToolCallReference(item.toolCall)).join(", ")}.`,
    skipped.length > 0
      ? `Skipped without execution and must also be requested again: ${skipped.map((item) => formatToolCallReference(item.toolCall)).join(", ")}.`
      : "No later writes were skipped.",
    `Return one new write-only response containing the failed and skipped writes, with no more than ${MAX_WRITE_TOOL_CALLS} write calls. Do not repeat successful writes and do not mix in read-only calls.`,
  ].join("\n");
}

function queueArgumentRepair(
  state: AgentRunState,
  failure: AgentToolFailure,
  toolName: SandboxAgentToolName,
  allowRepair: boolean,
) {
  if (!allowRepair || !failure.argumentValidationFailure) {
    return;
  }

  appendUserMessage(
    state,
    [
      `The previous ${toolName} call had invalid arguments and was not executed.`,
      "Review the validation error in the preceding tool result.",
      `Retry ${toolName} once with JSON arguments that match its schema and include every required field.`,
      "Do not omit, guess, or invent argument values.",
    ].join(" "),
  );
  state.pendingArgumentRepairTool = toolName;
}

function buildBatchObservation(executed: ExecutedAgentTool[]) {
  const observationParts = executed.flatMap((item) =>
    "latestObservation" in item.result ? [item.result.latestObservation] : [],
  );

  return observationParts.join("\n\n");
}

function getToolFailures(executed: ExecutedAgentTool[]) {
  return executed.filter(
    (item): item is {
      durationMs: number;
      result: AgentToolFailure;
      toolCall: AIToolCall;
    } => item.result.status === "tool_failure",
  );
}

function registerRecoveryAttempt(
  state: AgentRunState,
  toolFailures: Array<{
    result: AgentToolFailure;
    toolCall: AIToolCall;
  }>,
) {
  state.recoveryTurnsUsed += 1;

  const signatures = toolFailures.map((item) =>
    buildFailureSignature(
      item.result.tool,
      item.result.code,
      parseToolCallArguments(item.toolCall),
    ),
  );
  const turnSignature = buildFailureTurnSignature(signatures);

  if (state.lastFailureSignature === turnSignature) {
    state.sameFailureRepeatCount += 1;
  } else {
    state.lastFailureSignature = turnSignature;
    state.sameFailureRepeatCount = 1;
  }

  if (state.recoveryTurnsUsed >= MAX_RECOVERY_TURNS) {
    const firstFailure = toolFailures[0]!;
    return buildRetryExhaustedResult(
      firstFailure.result.tool,
      parseToolCallArguments(firstFailure.toolCall),
    );
  }

  if (state.sameFailureRepeatCount >= MAX_SAME_FAILURE_REPEATS) {
    const firstFailure = toolFailures[0]!;
    return buildRetryExhaustedResult(
      firstFailure.result.tool,
      parseToolCallArguments(firstFailure.toolCall),
    );
  }

  return null;
}

function resetRecoveryTracking(state: AgentRunState) {
  state.lastFailureSignature = undefined;
  state.sameFailureRepeatCount = 0;
}

async function executeReadOnlyBatch(
  toolCalls: AIToolCall[],
  sessionId: string,
  mode: SandboxAgentMode,
  step: number,
  parentSpan: Span,
): Promise<AgentToolBatchResult> {
  const executed = await Promise.all(
    toolCalls.map(async (toolCall): Promise<ExecutedAgentTool> => {
      const toolStartedAt = Date.now();
      const result = await executeToolCall(
        toolCall,
        sessionId,
        mode,
        step,
        parentSpan,
      );

      return {
        durationMs: Date.now() - toolStartedAt,
        result,
        toolCall,
      };
    }),
  );
  const touchedPaths: string[] = [];
  let latestSession: SandboxSession | undefined;
  let hadToolFailure = false;

  for (const executedTool of executed) {
    const { result } = executedTool;

    if ("touchedPath" in result && result.touchedPath) {
      touchedPaths.push(result.touchedPath);
    }

    if ("session" in result && result.session) {
      latestSession = result.session;
    }

    if (result.status === "internal_fatal_failure") {
      return {
        code: result.code,
        executed,
        latestObservation: buildBatchObservation(executed),
        latestSession,
        message: result.message,
        status: "internal_fatal_failure",
        touchedPaths,
      };
    }

    if (result.status === "tool_failure") {
      hadToolFailure = true;
    }
  }

  return {
    executed,
    latestObservation: buildBatchObservation(executed),
    latestSession,
    status: hadToolFailure ? "tool_failure" : "ok",
    touchedPaths,
  };
}

function applyRecoveredSessionToLastWrite(
  executed: ExecutedAgentTool[],
  session: SandboxSession,
) {
  for (let index = executed.length - 1; index >= 0; index -= 1) {
    const executedTool = executed[index]!;
    const { result } = executedTool;

    if (result.status !== "ok" || !result.touchedPath) continue;

    const toolPayload = JSON.parse(result.toolMessageContent) as Record<
      string,
      unknown
    >;

    executed[index] = {
      ...executedTool,
      result: {
        ...result,
        session,
        toolMessageContent: JSON.stringify({
          ...toolPayload,
          session,
        }),
      },
    };
    return;
  }
}

async function recoverWriteBatchPreview(
  sessionId: string,
  successfulWriteCount: number,
  step: number,
  parentSpan: Span,
) {
  return sandboxAgentTracer.startActiveSpan(
    "recover_write_batch_preview",
    {
      attributes: {
        "agent.step": step,
        "agent.write_batch.successful_write_count": successfulWriteCount,
      },
      kind: SpanKind.INTERNAL,
    },
    trace.setSpan(context.active(), parentSpan),
    async (span) => {
      try {
        const session = await sandboxProvider.recoverPreviewAfterWrites(
          sessionId,
        );
        span.setAttributes({
          "agent.write_batch.preview_state": session.previewState,
          "agent.write_batch.recovery_completed": true,
        });
        span.setStatus({ code: SpanStatusCode.OK });
        return session;
      } catch (error) {
        const exception =
          error instanceof Error ? error : new Error(String(error));

        span.recordException(exception);
        span.setAttributes({
          "agent.write_batch.recovery_completed": false,
          "error.type": exception.name || "Error",
        });
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: toTracePreview(exception.message, 220),
        });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

async function executeWriteBatch(
  toolCalls: AIToolCall[],
  sessionId: string,
  mode: SandboxAgentMode,
  step: number,
  parentSpan: Span,
  beforeExecute: (toolCall: AIToolCall) => Promise<void>,
): Promise<AgentToolBatchResult> {
  const executed: ExecutedAgentTool[] = [];
  const touchedPaths: string[] = [];
  let fatalFailure: AgentToolInternalFatalFailure | undefined;
  let latestSession: SandboxSession | undefined;
  let status: "ok" | "tool_failure" = "ok";

  for (const [index, toolCall] of toolCalls.entries()) {
    await beforeExecute(toolCall);
    const toolStartedAt = Date.now();
    const result = await executeToolCall(
      toolCall,
      sessionId,
      mode,
      step,
      parentSpan,
      { deferPreviewRecovery: true },
    );
    executed.push({
      durationMs: Date.now() - toolStartedAt,
      result,
      toolCall,
    });

    if ("touchedPath" in result && result.touchedPath) {
      touchedPaths.push(result.touchedPath);
    }

    if ("session" in result && result.session) {
      latestSession = result.session;
    }

    if (result.status === "internal_fatal_failure") {
      fatalFailure = result;
      break;
    }

    if (result.status === "tool_failure") {
      for (const skippedToolCall of toolCalls.slice(index + 1)) {
        executed.push({
          durationMs: 0,
          result: buildSkippedWriteResult(skippedToolCall, toolCall),
          toolCall: skippedToolCall,
        });
      }
      status = "tool_failure";
      break;
    }
  }

  if (touchedPaths.length > 0) {
    try {
      latestSession = await recoverWriteBatchPreview(
        sessionId,
        touchedPaths.length,
        step,
        parentSpan,
      );
      applyRecoveredSessionToLastWrite(executed, latestSession);
    } catch (error) {
      return {
        code: "internal_error",
        executed,
        latestObservation: buildBatchObservation(executed),
        latestSession,
        message: `The files were written, but preview verification could not complete: ${normalizeToolErrorMessage(error)}`,
        status: "internal_fatal_failure",
        touchedPaths,
      };
    }
  }

  if (fatalFailure) {
    return {
      code: fatalFailure.code,
      executed,
      latestObservation: buildBatchObservation(executed),
      latestSession,
      message: fatalFailure.message,
      status: "internal_fatal_failure",
      touchedPaths,
    };
  }

  return {
    executed,
    latestObservation: buildBatchObservation(executed),
    latestSession,
    status,
    touchedPaths,
  };
}

async function buildAgentResult(
  input: SandboxAgentInput,
  state: AgentRunState,
  result: Omit<
    SandboxAgentResult,
    "filesTouched" | "session" | "stepsUsed"
  > & {
    failureCode?: AgentFailureCode;
  },
): Promise<SandboxAgentInternalResult> {
  return {
    ...result,
    filesTouched: Array.from(state.filesTouched).sort(),
    session: await resolveFinalSession(state, input.sessionId),
    stepsUsed: state.stepsUsed,
    ...(state.usage ? { usage: state.usage } : {}),
  };
}

async function buildFailedResult(
  input: SandboxAgentInput,
  state: AgentRunState,
  failureCode: AgentFailureCode,
  message: string,
): Promise<SandboxAgentInternalResult> {
  return {
    failureCode,
    filesTouched: Array.from(state.filesTouched).sort(),
    message,
    session: await resolveFinalSession(state, input.sessionId),
    status: "failed",
    stepsUsed: state.stepsUsed,
    ...(state.usage ? { usage: state.usage } : {}),
  };
}

async function finalizeWithFinishTurn(
  input: SandboxAgentInput,
  state: AgentRunState,
  finishPrompt: string,
  options: RunSandboxAgentLoopOptions,
  failureCode?: AgentFailureCode,
) {
  let finishTurnResponse: AIGenerateTextResult;
  const finishTurnStartedAt = Date.now();

  try {
    await emitProgress(options.onProgress, "Finishing up...");
    finishTurnResponse = await callAgentFinishTurn(
      state,
      finishPrompt,
      options.agentRunSpan,
      options.onFinalTextDelta,
      input.model,
    );
  } catch (error) {
    console.error("Sandbox agent finish turn failed:", error);
    const mappedError = mapModelError(error);
    await emitAgentTrace(options.onTrace, {
      durationMs: Date.now() - finishTurnStartedAt,
      level: "error",
      payload: {
        message: mappedError.message,
      },
      phase: "finish",
      status: "failed",
      step: state.stepsUsed + 1,
      type: "model_error",
    });

    return buildFailedResult(input, state, mappedError.code, mappedError.message);
  }

  state.stepsUsed += 1;
  state.usage = mergeUsage(state.usage, finishTurnResponse.usage);
  await recordAgentModelResponse(
    input,
    "finish",
    state.stepsUsed,
    finishTurnResponse,
    Date.now() - finishTurnStartedAt,
    options,
  );

  let finishResponse: z.infer<typeof finishSchema>;

  try {
    finishResponse = parseFinishResponse(finishTurnResponse.text);
  } catch (error) {
    console.error("Sandbox agent finish response was invalid:", error);
    await emitAgentTrace(options.onTrace, {
      level: "error",
      model: finishTurnResponse.model,
      payload: {
        message: "The agent returned an invalid completion response.",
        responsePreview: toTracePreview(finishTurnResponse.text, 220),
      },
      phase: "finish",
      status: "failed",
      step: state.stepsUsed,
      type: "model_error",
    });
    return buildFailedResult(
      input,
      state,
      "internal_error",
      "The agent returned an invalid completion response.",
    );
  }

  return buildAgentResult(input, state, {
    clarificationQuestion: finishResponse.clarificationQuestion,
    failureCode,
    message: finishResponse.message,
    status: failureCode ? "blocked" : finishResponse.status,
  });
}

async function runSandboxAgentLoop(
  input: SandboxAgentInput,
  options: RunSandboxAgentLoopOptions,
): Promise<SandboxAgentInternalResult> {
  const instructionPreview = toTracePreview(input.userInstruction, 240);

  await emitAgentTrace(options.onTrace, {
    payload: {
      instructionPreview,
      issueNumber: input.issueNumber,
      mode: input.mode,
      projectId: input.projectId,
      repoName: input.repoName,
      repoOwner: input.repoOwner,
    },
    status: "running",
    type: "run_started",
  });

  console.log("Sandbox agent started:", {
    instructionPreview,
    issueNumber: input.issueNumber,
    mode: input.mode,
    projectId: input.projectId,
    repoName: input.repoName,
    repoOwner: input.repoOwner,
    sessionId: input.sessionId,
  });

  const state: AgentRunState = {
    filesTouched: new Set<string>(),
    lastFailureSignature: undefined,
    latestObservation: "No tool has been called yet.",
    recentEvents: [],
    recoveryTurnsUsed: 0,
    sameFailureRepeatCount: 0,
    stepsUsed: 0,
    transcript: [
      {
        content: buildAgentSystemPrompt(input.mode),
        role: "system",
      },
      ...input.conversationHistory,
      {
        content: buildAgentUserPrompt(input),
        role: "user",
      },
    ],
    usage: undefined,
  };
  let invalidBatchRetryUsed = false;
  let awaitingInvalidBatchRecovery = false;

  while (true) {
    let modelResponse: AIGenerateTextResult;
    const modelTurnStartedAt = Date.now();
    const argumentRepairTool = state.pendingArgumentRepairTool;
    state.pendingArgumentRepairTool = undefined;

    try {
      modelResponse = await callAgentToolTurn(
        state,
        input.mode,
        options.agentRunSpan,
        input.model,
        state.stepsUsed + 1,
        argumentRepairTool
          ? {
              function: {
                name: argumentRepairTool,
              },
              type: "function",
            }
          : "auto",
      );
    } catch (error) {
      console.error("Sandbox agent tool turn failed:", error);
      const mappedError = mapModelError(error);
      await emitAgentTrace(options.onTrace, {
        durationMs: Date.now() - modelTurnStartedAt,
        level: "error",
        payload: {
          message: mappedError.message,
        },
        phase: "tool",
        status: "failed",
        step: state.stepsUsed + 1,
        type: "model_error",
      });

      return buildFailedResult(input, state, mappedError.code, mappedError.message);
    }

    state.stepsUsed += 1;
    state.usage = mergeUsage(state.usage, modelResponse.usage);
    await recordAgentModelResponse(
      input,
      "tool",
      state.stepsUsed,
      modelResponse,
      Date.now() - modelTurnStartedAt,
      options,
    );
    await emitModelProgress(options.onProgress, modelResponse);

    const toolTurn = classifyToolTurn(modelResponse);

    if (toolTurn.status === "invalid_batch") {
      console.warn("Sandbox agent returned an invalid tool batch:", {
        issueNumber: input.issueNumber,
        projectId: input.projectId,
        reason: toolTurn.reason,
        step: state.stepsUsed,
        toolNames: toolTurn.toolCalls.map((toolCall) => toolCall.function.name),
      });
      await emitAgentTrace(options.onTrace, {
        level: "warn",
        payload: {
          reason: toolTurn.reason,
          toolNames: toolTurn.toolCalls.map(
            (toolCall) => toolCall.function.name,
          ),
        },
        status: "invalid",
        step: state.stepsUsed,
        type: "invalid_tool_batch",
      });

      if (invalidBatchRetryUsed) {
        console.error("Sandbox agent invalid batch retry exhausted:", {
          issueNumber: input.issueNumber,
          projectId: input.projectId,
          step: state.stepsUsed,
        });
        await emitAgentTrace(options.onTrace, {
          level: "error",
          payload: {
            message:
              "The agent returned an invalid tool batch and could not recover.",
          },
          status: "failed",
          step: state.stepsUsed,
          type: "recovery_exhausted",
        });
        return buildFailedResult(
          input,
          state,
          "internal_error",
          "The agent returned an invalid tool batch and could not recover.",
        );
      }

      const rejectedTools = toolTurn.toolCalls.map((toolCall) => ({
        durationMs: 0,
        result: buildRejectedToolCallResult(
          toolCall,
          toolTurn.code,
          toolTurn.reason,
        ),
        toolCall,
      }));
      appendToolMessages(
        state,
        toolTurn.toolCalls,
        rejectedTools.map((item) => ({
          toolCallId: item.toolCall.id,
          toolMessageContent: item.result.toolMessageContent,
        })),
        modelResponse.text,
      );
      state.latestObservation = buildBatchObservation(rejectedTools);
      pushRecentEvent(state, `Rejected tool batch: ${toolTurn.reason}`);

      appendUserMessage(state, buildMultiToolRetryPrompt());
      invalidBatchRetryUsed = true;
      awaitingInvalidBatchRecovery = true;
      continue;
    }

    if (awaitingInvalidBatchRecovery) {
      console.log("Sandbox agent invalid batch retry recovered:", {
        issueNumber: input.issueNumber,
        projectId: input.projectId,
        step: state.stepsUsed,
      });
      await emitAgentTrace(options.onTrace, {
        payload: {
          message: "The model recovered after an invalid tool batch.",
        },
        status: "recovered",
        step: state.stepsUsed,
        type: "recovery_recovered",
      });
      awaitingInvalidBatchRecovery = false;
    }

    if (toolTurn.status === "finish") {
      appendAssistantMessage(state, modelResponse.text);
      return finalizeWithFinishTurn(
        input,
        state,
        buildAgentFinishPrompt(input.mode),
        options,
        undefined,
      );
    }

    if (toolTurn.status === "single") {
      const toolCall = toolTurn.toolCalls[0];
      await emitToolProgress(options.onProgress, toolCall);
      const toolStartedAt = Date.now();
      const toolResult = await executeToolCall(
        toolCall,
        input.sessionId,
        input.mode,
        state.stepsUsed,
        options.agentRunSpan,
      );
      await recordAgentToolResult(
        input,
        state.stepsUsed,
        toolCall,
        toolResult,
        Date.now() - toolStartedAt,
        options,
      );

      pushRecentEvent(state, toolResult.recentEvent);

      if (toolResult.status === "internal_fatal_failure") {
        return buildFailedResult(input, state, toolResult.code, toolResult.message);
      }

      appendToolMessages(
        state,
        [toolCall],
        [
          {
            toolCallId: toolCall.id,
            toolMessageContent: toolResult.toolMessageContent,
          },
        ],
        modelResponse.text,
      );
      state.latestObservation = toolResult.latestObservation;

      if (toolResult.status === "tool_failure") {
        const exhaustedFailure = registerRecoveryAttempt(state, [
          { result: toolResult, toolCall },
        ]);

        if (exhaustedFailure) {
          pushRecentEvent(state, exhaustedFailure.recentEvent);
          state.latestObservation = exhaustedFailure.latestObservation;
          await emitAgentTrace(options.onTrace, {
            level: "error",
            payload: {
              message: exhaustedFailure.message,
              recentEvent: exhaustedFailure.recentEvent,
            },
            status: "failed",
            step: state.stepsUsed,
            type: "recovery_exhausted",
          });
          appendUserMessage(
            state,
            [
              "Recovery for the previous retryable tool failure is exhausted.",
              exhaustedFailure.toolMessageContent,
              "Explain the issue to the user and stop.",
            ].join("\n"),
          );

          return finalizeWithFinishTurn(
            input,
            state,
            buildTerminalFailureFinishPrompt(),
            options,
            exhaustedFailure.code,
          );
        }

        queueArgumentRepair(
          state,
          toolResult,
          toolCall.function.name as SandboxAgentToolName,
          !argumentRepairTool,
        );

        continue;
      }

      resetRecoveryTracking(state);

      if (toolResult.touchedPath) {
        state.filesTouched.add(toolResult.touchedPath);
      }

      if (toolResult.session) {
        state.latestSession = toolResult.session;
      }

      continue;
    }

    let batchResult: AgentToolBatchResult;

    if (toolTurn.status === "read_only_batch") {
      for (const toolCall of toolTurn.toolCalls) {
        await emitToolProgress(options.onProgress, toolCall);
      }

      batchResult = await executeReadOnlyBatch(
        toolTurn.toolCalls,
        input.sessionId,
        input.mode,
        state.stepsUsed,
        options.agentRunSpan,
      );
    } else {
      batchResult = await executeWriteBatch(
        toolTurn.toolCalls,
        input.sessionId,
        input.mode,
        state.stepsUsed,
        options.agentRunSpan,
        (toolCall) => emitToolProgress(options.onProgress, toolCall),
      );
    }

    for (const executedTool of batchResult.executed) {
      await recordAgentToolResult(
        input,
        state.stepsUsed,
        executedTool.toolCall,
        executedTool.result,
        executedTool.durationMs,
        options,
      );
      pushRecentEvent(state, executedTool.result.recentEvent);
    }

    if (batchResult.status === "internal_fatal_failure") {
      for (const touchedPath of batchResult.touchedPaths) {
        state.filesTouched.add(touchedPath);
      }

      if (batchResult.latestSession) {
        state.latestSession = batchResult.latestSession;
      }

      if (batchResult.latestObservation) {
        state.latestObservation = batchResult.latestObservation;
      }

      return buildFailedResult(input, state, batchResult.code, batchResult.message);
    }

    appendToolMessages(
      state,
      toolTurn.toolCalls,
      batchResult.executed.flatMap((executedTool) =>
        hasToolMessageContent(executedTool.result)
          ? [
              {
                toolCallId: executedTool.toolCall.id,
                toolMessageContent: executedTool.result.toolMessageContent,
              },
            ]
          : [],
      ),
      modelResponse.text,
    );
    state.latestObservation = batchResult.latestObservation;

    for (const touchedPath of batchResult.touchedPaths) {
      state.filesTouched.add(touchedPath);
    }

    if (batchResult.latestSession) {
      state.latestSession = batchResult.latestSession;
    }

    if (batchResult.status === "tool_failure") {
      const toolFailures = getToolFailures(batchResult.executed);
      const exhaustedFailure = registerRecoveryAttempt(state, toolFailures);

      if (exhaustedFailure) {
        pushRecentEvent(state, exhaustedFailure.recentEvent);
        await emitAgentTrace(options.onTrace, {
          level: "error",
          payload: {
            message: exhaustedFailure.message,
            recentEvent: exhaustedFailure.recentEvent,
          },
          status: "failed",
          step: state.stepsUsed,
          type: "recovery_exhausted",
        });
        appendUserMessage(
          state,
          [
            "Recovery for the previous retryable tool failures is exhausted.",
            exhaustedFailure.toolMessageContent,
            "Explain the issue to the user and stop.",
          ].join("\n"),
        );

        return finalizeWithFinishTurn(
          input,
          state,
          buildTerminalFailureFinishPrompt(),
          options,
          exhaustedFailure.code,
        );
      }

      if (toolTurn.status === "write_batch") {
        appendUserMessage(
          state,
          buildWriteBatchRecoveryPrompt(batchResult.executed),
        );
        continue;
      }

      const argumentFailure = toolFailures.find(
        (item) => item.result.argumentValidationFailure,
      );

      if (argumentFailure) {
        queueArgumentRepair(
          state,
          argumentFailure.result,
          argumentFailure.toolCall.function.name as SandboxAgentToolName,
          !argumentRepairTool,
        );
      }

      continue;
    }

    resetRecoveryTracking(state);
  }
}

export async function runSandboxAgent(
  input: SandboxAgentInput,
  options: RunSandboxAgentOptions = {},
): Promise<SandboxAgentInternalResult> {
  return sandboxAgentTracer.startActiveSpan(
    "sandbox_agent.run",
    {
      attributes: {
        "agent.mode": input.mode,
        "conversation.session_id": input.conversationSessionId,
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.request.model": input.model,
        "issue.number": input.issueNumber,
      },
    },
    async (span) => {
      try {
        const result = await runSandboxAgentLoop(input, {
          ...options,
          agentRunSpan: span,
        });
        recordAgentRunSpanResult(span, result);
        return result;
      } catch (error) {
        const exception =
          error instanceof Error ? error : new Error(String(error));

        span.recordException(exception);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: exception.message,
        });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}
