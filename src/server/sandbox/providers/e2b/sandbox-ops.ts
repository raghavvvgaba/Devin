import type { SandboxInfo } from "e2b";

import { env } from "~/env";
import { PROJECT_DIR } from "~/server/sandbox/providers/e2b/constants";
import {
  SandboxExpiredError,
  appendLog,
  applySandboxInfo,
  deleteTrackedSession,
  isSandboxNotFoundError,
} from "~/server/sandbox/providers/e2b/session-state";
import type {
  E2BSandboxSession,
  RunStepInput,
  SandboxCtor,
} from "~/server/sandbox/providers/e2b/types";

let sandboxCtorPromise: Promise<SandboxCtor> | null = null;

export async function getSandboxCtor() {
  if (!sandboxCtorPromise) {
    sandboxCtorPromise = import("e2b").then((mod) => mod.Sandbox);
  }

  return sandboxCtorPromise;
}

export function requireApiKey() {
  if (!env.E2B_API_KEY) {
    throw new Error(
      "Missing E2B_API_KEY. Add it to .env.local and restart the Next dev server.",
    );
  }
}

export function normalizePreviewUrl(host: string) {
  if (host.startsWith("http://") || host.startsWith("https://")) return host;
  return `https://${host}`;
}

export async function refreshSandboxInfo(session: E2BSandboxSession) {
  if (!session.sandbox) return;

  try {
    applySandboxInfo(
      session,
      await session.sandbox.getInfo({ requestTimeoutMs: 10_000 }),
    );
  } catch (error) {
    if (isSandboxNotFoundError(error)) {
      deleteTrackedSession(session.sessionId);
      throw new SandboxExpiredError();
    }

    throw error;
  }
}

export async function verifySandboxHealth(session: E2BSandboxSession) {
  await refreshSandboxInfo(session);
}

export async function runStep(session: E2BSandboxSession, input: RunStepInput) {
  const cwd = input.cwd ?? PROJECT_DIR;
  appendLog(session, `\n$ ${input.displayCommand ?? input.command}\n`);
  await session.sandbox?.commands.run(input.command, {
    cwd,
    timeoutMs: input.timeoutMs,
    onStdout: (data: string) => appendLog(session, data),
    onStderr: (data: string) => appendLog(session, data),
  });
}

export async function fileExists(session: E2BSandboxSession, path: string) {
  if (!session.sandbox) throw new Error("Sandbox is not ready.");
  return session.sandbox.files.exists(path, { requestTimeoutMs: 10_000 });
}

export async function readTextFile(session: E2BSandboxSession, path: string) {
  if (!session.sandbox) throw new Error("Sandbox is not ready.");
  return session.sandbox.files.read(path, { requestTimeoutMs: 10_000 });
}

export function toSandboxListItem(info: SandboxInfo) {
  return {
    sandboxId: info.sandboxId,
    state: info.state,
    startedAt: info.startedAt.toISOString(),
    endAt: info.endAt.toISOString(),
    remainingMs: Math.max(0, info.endAt.getTime() - Date.now()),
    sessionId: info.metadata.sessionId,
  };
}
