import { trace } from "@opentelemetry/api";
import { TimeoutError } from "e2b";

import {
  getRunningSandboxToolSession,
} from "~/server/sandbox/providers/e2b/lifecycle";
import { recoverPreviewAfterEdit } from "~/server/sandbox/providers/e2b/preview";
import {
  appendLog,
  publicSession,
  setPreviewState,
} from "~/server/sandbox/providers/e2b/session-state";
import {
  normalizeSandboxRelativePath,
  shouldHideSandboxEntry,
  toSandboxRepoPath,
} from "~/server/sandbox/tools/paths";
import type {
  SandboxFileEntry,
  SandboxRawFile,
  SandboxRawFileInput,
  SandboxRawListFilesInput,
  SandboxRawWriteFileInput,
} from "~/server/sandbox/types";

const RAW_FILE_READ_TIMEOUT_MS = 5_000;
const MAX_RAW_FILE_READ_ATTEMPTS = 2;

export async function readRawSandboxFile(
  input: SandboxRawFileInput,
): Promise<SandboxRawFile> {
  const session = await getRunningSandboxToolSession(input.sessionId);
  const relativePath = normalizeSandboxRelativePath(input.path);
  const sandboxPath = toSandboxRepoPath(relativePath);
  const activeSpan = trace.getActiveSpan();
  let content: string | undefined;

  for (let attempt = 1; attempt <= MAX_RAW_FILE_READ_ATTEMPTS; attempt += 1) {
    const startedAt = Date.now();

    try {
      content = await session.sandbox!.files.read(sandboxPath, {
        requestTimeoutMs: RAW_FILE_READ_TIMEOUT_MS,
      });

      activeSpan?.addEvent("agent.tool.read.attempt", {
        "agent.tool.read.attempt": attempt,
        "agent.tool.read.duration_ms": Date.now() - startedAt,
        "agent.tool.read.status": "success",
        "agent.tool.read.timeout_ms": RAW_FILE_READ_TIMEOUT_MS,
      });
      activeSpan?.setAttributes({
        "agent.tool.read.attempt_count": attempt,
        "agent.tool.read.retry_count": attempt - 1,
        "agent.tool.read.retry_recovered": attempt > 1,
      });
      break;
    } catch (error) {
      const retryable = error instanceof TimeoutError;
      const hasAttemptsRemaining = attempt < MAX_RAW_FILE_READ_ATTEMPTS;

      activeSpan?.addEvent("agent.tool.read.attempt", {
        "agent.tool.read.attempt": attempt,
        "agent.tool.read.duration_ms": Date.now() - startedAt,
        "agent.tool.read.status": retryable ? "timeout" : "failure",
        "agent.tool.read.timeout_ms": RAW_FILE_READ_TIMEOUT_MS,
      });

      if (!retryable || !hasAttemptsRemaining) {
        activeSpan?.setAttributes({
          "agent.tool.read.attempt_count": attempt,
          "agent.tool.read.retry_count": attempt - 1,
          "agent.tool.read.retry_recovered": false,
        });
        throw error;
      }
    }
  }

  if (content === undefined) {
    throw new Error("Sandbox file read completed without content.");
  }

  return {
    content,
    path: relativePath,
    size: Buffer.byteLength(content, "utf8"),
  };
}

export async function writeRawSandboxFile(input: SandboxRawWriteFileInput) {
  const session = await getRunningSandboxToolSession(input.sessionId);
  const relativePath = normalizeSandboxRelativePath(input.path);
  const sandboxPath = toSandboxRepoPath(relativePath);

  await session.sandbox!.files.write(sandboxPath, input.content, {
    requestTimeoutMs: 15_000,
  });
  appendLog(session, `\nWrote ${relativePath}\n`);

  if (!input.deferPreviewRecovery) {
    setPreviewState(session, "recovering", "Saving change and refreshing preview.");
    await recoverPreviewAfterEdit(session);
  }

  return {
    path: relativePath,
    session: publicSession(session),
  };
}

export async function recoverSandboxPreviewAfterWrites(sessionId: string) {
  const session = await getRunningSandboxToolSession(sessionId);

  setPreviewState(session, "recovering", "Changes saved. Refreshing preview.");
  await recoverPreviewAfterEdit(session);

  return publicSession(session);
}

export async function listRawSandboxFiles(
  input: SandboxRawListFilesInput,
): Promise<SandboxFileEntry[]> {
  const session = await getRunningSandboxToolSession(input.sessionId);
  const relativePath = normalizeSandboxRelativePath(input.path, { allowRoot: true });
  const sandboxPath = toSandboxRepoPath(relativePath);
  const entries = await session.sandbox!.files.list(sandboxPath, {
    requestTimeoutMs: 20_000,
  });

  return entries
    .filter((entry) => !shouldHideSandboxEntry(entry.name))
    .map((entry) => {
      const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const type = String(entry.type ?? "unknown");

      return {
        name: entry.name,
        path: entryPath,
        size: entry.size,
        type: type === "dir" || type === "file" ? type : "unknown",
      };
    });
}
