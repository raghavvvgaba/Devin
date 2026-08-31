import "server-only";

import type { AIUsage } from "~/server/ai/types";

export type SandboxAgentTraceLevel = "error" | "info" | "warn";

export type SandboxAgentTraceEvent = {
  durationMs?: number;
  level?: SandboxAgentTraceLevel;
  model?: string;
  paths?: string[];
  payload: Record<string, unknown>;
  phase?: "finish" | "tool";
  status?: string;
  step?: number;
  toolCallId?: string;
  toolName?: string;
  type:
    | "invalid_tool_batch"
    | "model_error"
    | "model_response"
    | "persistence_error"
    | "recovery_exhausted"
    | "recovery_recovered"
    | "run_completed"
    | "run_failed"
    | "run_started"
    | "tool_result";
  usage?: AIUsage;
};

export type SandboxAgentTraceHandler = (
  event: SandboxAgentTraceEvent,
) => Promise<void> | void;

const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|credential|password|private.?key|secret|session.?token|token)/i;
const SECRET_VALUE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:gh[opsu]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})\b/g,
];
const MAX_TRACE_STRING_LENGTH = 500;
const MAX_TRACE_ARRAY_LENGTH = 40;

const SAFE_TOOL_SPAN_ERROR_CODES = new Set([
  "ambiguous_text_match",
  "command_not_allowed",
  "file_too_large",
  "glob_failed",
  "internal_error",
  "invalid_include_pattern",
  "invalid_line_range",
  "invalid_path",
  "invalid_pattern",
  "invalid_tool_arguments_json",
  "invalid_tool_batch",
  "missing_old_text",
  "missing_path",
  "missing_patterns",
  "missing_query",
  "replacement_too_large",
  "search_failed",
  "skipped_due_to_prior_write_failure",
  "text_not_found",
  "tool_retry_exhausted",
  "unknown_tool",
  "unknown_tool_error",
  "write_batch_limit_exceeded",
  "write_not_allowed_in_plan_mode",
]);

// Controller codes can fall back to raw error messages. Only export known codes;
// leave the original errors intact for controller feedback and activity logs.
export function toToolSpanErrorType(code: string, argumentValidationFailure = false) {
  const category = code.split(":", 1)[0] ?? "";
  if (SAFE_TOOL_SPAN_ERROR_CODES.has(category)) {
    return category;
  }

  return argumentValidationFailure
    ? "invalid_tool_arguments"
    : "tool_execution_failed";
}

function redactSensitiveText(value: string) {
  return SECRET_VALUE_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, "[REDACTED]"),
    value,
  );
}

export function toTracePreview(value: string, maxLength: number) {
  const normalized = redactSensitiveText(value).trim().replace(/\s+/g, " ");

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function sanitizeTraceValue(
  value: unknown,
  key = "",
  depth = 0,
): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return "[REDACTED]";
  }

  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const redacted = redactSensitiveText(value);
    return redacted.length > MAX_TRACE_STRING_LENGTH
      ? `${redacted.slice(0, MAX_TRACE_STRING_LENGTH)}...`
      : redacted;
  }

  if (depth >= 4) {
    return "[TRUNCATED]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_TRACE_ARRAY_LENGTH)
      .map((item) => sanitizeTraceValue(item, key, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nestedValue]) => nestedValue !== undefined)
        .map(([nestedKey, nestedValue]) => [
          nestedKey,
          sanitizeTraceValue(nestedValue, nestedKey, depth + 1),
        ]),
    );
  }

  return String(value);
}

function summarizeSourceText(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  return {
    characterCount: value.length,
    lineCount: value === "" ? 0 : value.split(/\r?\n/).length,
  };
}

export function sanitizeToolArguments(
  toolName: string,
  argumentsValue: Record<string, unknown>,
) {
  const safeArguments = { ...argumentsValue };

  if (toolName === "write_file" && "content" in safeArguments) {
    safeArguments.content = summarizeSourceText(safeArguments.content);
  }

  if (toolName === "replace_in_file") {
    if ("oldText" in safeArguments) {
      safeArguments.oldText = summarizeSourceText(safeArguments.oldText);
    }
    if ("newText" in safeArguments) {
      safeArguments.newText = summarizeSourceText(safeArguments.newText);
    }
  }

  return sanitizeTraceValue(safeArguments) as Record<string, unknown>;
}

function addPath(paths: Set<string>, value: unknown) {
  if (typeof value === "string" && value.trim()) {
    paths.add(value.trim());
  }
}

function collectPathsFromValue(paths: Set<string>, value: unknown, depth = 0) {
  if (depth > 3 || value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, MAX_TRACE_ARRAY_LENGTH)) {
      collectPathsFromValue(paths, item, depth + 1);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  addPath(paths, record.path);

  if (Array.isArray(record.paths)) {
    for (const path of record.paths) {
      addPath(paths, path);
    }
  }

  if (Array.isArray(record.matches)) {
    for (const match of record.matches) {
      if (match && typeof match === "object") {
        addPath(paths, (match as Record<string, unknown>).path);
      }
    }
  }

  for (const nestedValue of Object.values(record)) {
    collectPathsFromValue(paths, nestedValue, depth + 1);
  }
}

export function collectToolPaths(input: {
  argumentsValue: Record<string, unknown>;
  resultValue?: unknown;
  touchedPath?: string;
}) {
  const paths = new Set<string>();

  addPath(paths, input.argumentsValue.path);
  addPath(paths, input.touchedPath);
  collectPathsFromValue(paths, input.resultValue);

  return Array.from(paths).sort();
}

export function parseToolArgumentsForTrace(rawArguments: string) {
  try {
    return JSON.parse(rawArguments) as Record<string, unknown>;
  } catch {
    return {
      _rawPreview: toTracePreview(rawArguments, 160),
    };
  }
}

export function parseToolResultForTrace(toolMessageContent?: string) {
  if (!toolMessageContent) {
    return undefined;
  }

  try {
    return JSON.parse(toolMessageContent) as unknown;
  } catch {
    return undefined;
  }
}

export function sanitizeTracePayload(payload: Record<string, unknown>) {
  return sanitizeTraceValue(payload) as Record<string, unknown>;
}
