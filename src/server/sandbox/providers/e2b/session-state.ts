import type { SandboxInfo } from "e2b";

import {
  ABANDONMENT_GRACE_MS,
  HEARTBEAT_INTERVAL_MS,
} from "~/server/sandbox/providers/e2b/constants";
import type { E2BSandboxSession } from "~/server/sandbox/providers/e2b/types";
import type {
  PreviewState,
  SandboxSession as PublicSandboxSession,
  SandboxSubmitStage,
  SandboxSubmitState,
  StartupStage,
} from "~/server/sandbox/types";

export type SandboxListItem = {
  sandboxId: string;
  state: string;
  startedAt: string;
  endAt: string;
  remainingMs: number;
  sessionId?: string;
};

export class SandboxExpiredError extends Error {
  code = "SANDBOX_EXPIRED" as const;

  constructor() {
    super("Previous sandbox expired or was killed. Start a new sandbox.");
    this.name = "SandboxExpiredError";
  }
}

export class SessionCancelledError extends Error {
  constructor() {
    super("Startup cancelled.");
    this.name = "SessionCancelledError";
  }
}

declare global {
  var __e2bSandboxSessions: Map<string, E2BSandboxSession> | undefined;
}

export const trackedSessions =
  globalThis.__e2bSandboxSessions ?? new Map<string, E2BSandboxSession>();
globalThis.__e2bSandboxSessions = trackedSessions;

export function getTrackedSession(sessionId: string) {
  return trackedSessions.get(sessionId);
}

export function setTrackedSession(session: E2BSandboxSession) {
  trackedSessions.set(session.sessionId, session);
}

export function deleteTrackedSession(sessionId: string) {
  trackedSessions.delete(sessionId);
}

function redactSessionText(session: E2BSandboxSession, text: string) {
  let redacted = text;
  for (const sensitiveValue of session.sensitiveLogValues ?? []) {
    if (!sensitiveValue) continue;
    redacted = redacted.split(sensitiveValue).join("[redacted]");
  }
  return redacted;
}

export function appendLog(session: E2BSandboxSession, line: string) {
  session.logs.push(redactSessionText(session, line));
  if (session.logs.length > 700) {
    session.logs.splice(0, session.logs.length - 700);
  }
}

export function publicSession(session: E2BSandboxSession): PublicSandboxSession {
  return {
    sessionId: session.sessionId,
    environmentId: session.sandboxId,
    previewUrl: session.previewUrl,
    status: session.status,
    logs: session.logs,
    failureCode: session.failureCode,
    failureMessage: session.failureMessage,
    message: session.message,
    startedAt: session.startedAt,
    endAt: session.endAt,
    remainingMs: session.endAt
      ? Math.max(0, new Date(session.endAt).getTime() - Date.now())
      : undefined,
    previewState: session.previewState,
    previewError: session.previewError,
    previewMessage: session.previewMessage,
    startupStage: session.startupStage,
    startupMessage: session.startupMessage,
    submitState: session.submitState,
    submitStage: session.submitStage,
    submitMessage: session.submitMessage,
  };
}

export function describeError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown sandbox error.";

  const stdout =
    "stdout" in error && typeof error.stdout === "string"
      ? error.stdout.trim()
      : "";
  const stderr =
    "stderr" in error && typeof error.stderr === "string"
      ? error.stderr.trim()
      : "";
  const detail = stderr || stdout;

  if (!detail) return error.message;

  const tail = detail.length > 1400 ? detail.slice(-1400) : detail;
  return `${error.message}\n${tail}`;
}

export function describeSessionError(
  session: E2BSandboxSession,
  error: unknown,
) {
  return redactSessionText(session, describeError(error));
}

export function isSandboxNotFoundError(error: unknown) {
  if (!(error instanceof Error)) return false;

  return (
    error.name === "SandboxNotFoundError" ||
    error.message.toLowerCase().includes("not found") ||
    error.message.toLowerCase().includes("expired")
  );
}

export function stoppedSession(
  sessionId: string,
  sandboxId: string,
  logs: string[] = ["Sandbox stopped.\n"],
) {
  return {
    sessionId,
    environmentId: sandboxId,
    previewUrl: "",
    status: "stopped" as const,
    logs,
    message: undefined,
    startedAt: undefined,
    endAt: undefined,
    remainingMs: undefined,
    previewState: "offline" as const,
    previewError: undefined,
    previewMessage: undefined,
    startupStage: undefined,
    startupMessage: undefined,
  };
}

export function setPreviewState(
  session: E2BSandboxSession,
  state: PreviewState,
  message?: string,
) {
  session.previewState = state;
  session.previewMessage = message;
}

export function setPreviewError(
  session: E2BSandboxSession,
  error?: string,
) {
  session.previewError = error ? redactSessionText(session, error) : undefined;
}

export function setStartupStage(
  session: E2BSandboxSession,
  stage: StartupStage,
  message: string,
) {
  session.startupStage = stage;
  session.startupMessage = message;
}

export function setSubmitProgress(
  session: E2BSandboxSession,
  input: {
    message?: string;
    stage?: SandboxSubmitStage;
    state: SandboxSubmitState;
  },
) {
  session.submitState = input.state;
  session.submitStage = input.stage;
  session.submitMessage = input.message;
}

export function assertSessionActive(session: E2BSandboxSession) {
  if (session.cancelRequested) {
    throw new SessionCancelledError();
  }
}

export function applySandboxInfo(
  session: E2BSandboxSession,
  info: Pick<SandboxInfo, "startedAt" | "endAt">,
) {
  session.startedAt = info.startedAt.toISOString();
  session.endAt = info.endAt.toISOString();
}

export function clearAbandonmentCheck(session: E2BSandboxSession) {
  if (session.abandonmentCleanupTask) {
    clearTimeout(session.abandonmentCleanupTask);
    session.abandonmentCleanupTask = undefined;
  }
}

async function persistAbandonedSessionStopped(session: E2BSandboxSession) {
  try {
    const { markSandboxSessionStopped } = await import(
      "~/server/sandbox/session-registry"
    );
    await markSandboxSessionStopped(session.sessionId);
  } catch (error) {
    appendLog(
      session,
      `Unable to persist inactivity cleanup: ${describeSessionError(
        session,
        error,
      )}\n`,
    );
  }
}

async function abandonSession(session: E2BSandboxSession) {
  clearAbandonmentCheck(session);

  const abandonedAt = new Date().toISOString();
  session.abandonedAt = abandonedAt;
  session.message =
    "This preview was closed after 10 minutes without activity.";
  session.cancelRequested = true;
  appendLog(
    session,
    "\nNo heartbeat received for 10 minutes. Automatically stopping sandbox.\n",
  );

  try {
    if (session.sandbox && session.status !== "stopped") {
      await session.sandbox.kill({ requestTimeoutMs: 30_000 });
    }
    session.status = "stopped";
    session.previewState = "offline";
    session.previewMessage = "Preview closed after 10 minutes without activity.";
    session.startupStage = undefined;
    session.startupMessage = undefined;
    session.sandbox = undefined;
    session.previewProcessId = undefined;
    await persistAbandonedSessionStopped(session);
    appendLog(session, "Sandbox stopped after inactivity.\n");
  } catch (error) {
    if (isSandboxNotFoundError(error)) {
      session.status = "stopped";
      session.previewState = "offline";
      session.previewMessage =
        "Preview closed after 10 minutes without activity.";
      session.startupStage = undefined;
      session.startupMessage = undefined;
      session.sandbox = undefined;
      session.previewProcessId = undefined;
      await persistAbandonedSessionStopped(session);
      appendLog(
        session,
        "Sandbox was already gone during inactivity cleanup.\n",
      );
      return;
    }

    session.status = "error";
    session.previewState = "offline";
    session.previewMessage = "Preview closed after 10 minutes without activity.";
    session.message = `This preview was closed after 10 minutes without activity.\n${describeSessionError(
      session,
      error,
    )}`;
    appendLog(
      session,
      `Automatic inactivity cleanup failed: ${describeSessionError(
        session,
        error,
      )}\n`,
    );
  }
}

export function scheduleAbandonmentCheck(session: E2BSandboxSession) {
  clearAbandonmentCheck(session);

  session.abandonmentCleanupTask = setTimeout(() => {
    void (async () => {
      const lastHeartbeatAt = session.lastHeartbeatAt
        ? new Date(session.lastHeartbeatAt).getTime()
        : 0;
      if (!lastHeartbeatAt) return;

      const silentForMs = Date.now() - lastHeartbeatAt;
      if (silentForMs < ABANDONMENT_GRACE_MS) {
        scheduleAbandonmentCheck(session);
        return;
      }

      if (session.status === "stopped" || session.status === "error") {
        clearAbandonmentCheck(session);
        return;
      }

      await abandonSession(session);
    })();
  }, ABANDONMENT_GRACE_MS + HEARTBEAT_INTERVAL_MS);
}

export function recordSessionHeartbeat(sessionId: string) {
  const session = trackedSessions.get(sessionId);
  if (!session) return null;

  session.lastHeartbeatAt = new Date().toISOString();
  session.abandonedAt = undefined;

  if (session.status !== "stopped" && session.status !== "error") {
    scheduleAbandonmentCheck(session);
  } else {
    clearAbandonmentCheck(session);
  }

  return session;
}

export function getRunningToolSession(sessionId: string) {
  const session = recordSessionHeartbeat(sessionId);

  if (!session?.sandbox) {
    throw new Error("Session not found.");
  }

  if (session.status !== "running") {
    throw new Error("Sandbox is not running.");
  }

  return session;
}
