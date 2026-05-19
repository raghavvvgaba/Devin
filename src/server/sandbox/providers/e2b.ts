import "server-only";

import type { CommandHandle, Sandbox as E2BSandbox, SandboxInfo } from "e2b";

import { env } from "~/env";
import type {
  PreviewState,
  SandboxProvider,
  SandboxSession as PublicSandboxSession,
  SandboxStatus,
  StartupStage,
  StopSandboxSessionInput,
} from "~/server/sandbox/types";

type SandboxCtor = typeof import("e2b").Sandbox;

type E2BSandboxSession = {
  sessionId: string;
  sandboxId: string;
  previewUrl: string;
  status: SandboxStatus;
  logs: string[];
  message?: string;
  startedAt?: string;
  endAt?: string;
  remainingMs?: number;
  previewState: PreviewState;
  previewMessage?: string;
  previewVersion?: string;
  previewObservedVersion?: string;
  startupStage?: StartupStage;
  startupMessage?: string;
  sandbox?: E2BSandbox;
  previewProcessId?: number;
  restartingPreview?: Promise<void>;
  startupTask?: Promise<void>;
  cancelRequested?: boolean;
  lastHeartbeatAt?: string;
  abandonedAt?: string;
  abandonmentCleanupTask?: ReturnType<typeof setTimeout>;
};

export type SandboxListItem = {
  sandboxId: string;
  state: string;
  startedAt: string;
  endAt: string;
  remainingMs: number;
  sessionId?: string;
};

type RestoreSessionInput = {
  sessionId: string;
  sandboxId: string;
};

export class SandboxExpiredError extends Error {
  code = "SANDBOX_EXPIRED" as const;

  constructor() {
    super("Previous sandbox expired or was killed. Start a new sandbox.");
    this.name = "SandboxExpiredError";
  }
}

class SessionCancelledError extends Error {
  constructor() {
    super("Startup cancelled.");
    this.name = "SessionCancelledError";
  }
}

const PROJECT_DIR = "/home/user/devin-e2b-preview";
const PREVIEW_PORT = 5173;
const PREVIEW_VERSION_PATH = "__preview_version.txt";
const SANDBOX_TIMEOUT_MS = 30 * 60_000;
const CREATE_VITE_VERSION = "5.5.5";
const SANDBOX_METADATA_APP = "devin-e2b-preview";
const STARTUP_PREVIEW_TIMEOUT_MS = 75_000;
const RESTART_PREVIEW_TIMEOUT_MS = 15_000;
const RESTORE_PREVIEW_TIMEOUT_MS = 10_000;
const EDIT_PREVIEW_TIMEOUT_MS = 8_000;
const PREVIEW_RETRY_DELAY_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const ABANDONMENT_GRACE_MS = 10 * 60_000;

declare global {
  var __e2bSandboxSessions: Map<string, E2BSandboxSession> | undefined;
}

const sessions = globalThis.__e2bSandboxSessions ?? new Map<string, E2BSandboxSession>();
globalThis.__e2bSandboxSessions = sessions;

let sandboxCtorPromise: Promise<SandboxCtor> | null = null;

async function getSandboxCtor() {
  if (!sandboxCtorPromise) {
    sandboxCtorPromise = import("e2b").then((mod) => mod.Sandbox);
  }

  return sandboxCtorPromise;
}

function appendLog(session: E2BSandboxSession, line: string) {
  session.logs.push(line);
  if (session.logs.length > 700) {
    session.logs.splice(0, session.logs.length - 700);
  }
}

function requireApiKey() {
  if (!env.E2B_API_KEY) {
    throw new Error("Missing E2B_API_KEY. Add it to .env.local and restart the Next dev server.");
  }
}

function normalizePreviewUrl(host: string) {
  if (host.startsWith("http://") || host.startsWith("https://")) return host;
  return `https://${host}`;
}

function publicSession(session: E2BSandboxSession): PublicSandboxSession {
  return {
    sessionId: session.sessionId,
    environmentId: session.sandboxId,
    previewUrl: session.previewUrl,
    status: session.status,
    logs: session.logs,
    message: session.message,
    startedAt: session.startedAt,
    endAt: session.endAt,
    remainingMs: session.endAt ? Math.max(0, new Date(session.endAt).getTime() - Date.now()) : undefined,
    previewState: session.previewState,
    previewMessage: session.previewMessage,
    previewVersion: session.previewVersion,
    previewObservedVersion: session.previewObservedVersion,
    startupStage: session.startupStage,
    startupMessage: session.startupMessage,
  };
}

function describeError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown sandbox error.";

  const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout.trim() : "";
  const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : "";
  const detail = stderr || stdout;

  if (!detail) return error.message;

  const tail = detail.length > 1400 ? detail.slice(-1400) : detail;
  return `${error.message}\n${tail}`;
}

function isSandboxNotFoundError(error: unknown) {
  if (!(error instanceof Error)) return false;

  return (
    error.name === "SandboxNotFoundError" ||
    error.message.toLowerCase().includes("not found") ||
    error.message.toLowerCase().includes("expired")
  );
}

function stoppedSession(sessionId: string, sandboxId: string, logs: string[] = ["Sandbox stopped.\n"]) {
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
    previewMessage: undefined,
    previewVersion: undefined,
    previewObservedVersion: undefined,
    startupStage: undefined,
    startupMessage: undefined,
  };
}

function setPreviewState(session: E2BSandboxSession, state: PreviewState, message?: string) {
  session.previewState = state;
  session.previewMessage = message;
}

function setStartupStage(session: E2BSandboxSession, stage: StartupStage, message: string) {
  session.startupStage = stage;
  session.startupMessage = message;
}

function clearAbandonmentCheck(session: E2BSandboxSession) {
  if (session.abandonmentCleanupTask) {
    clearTimeout(session.abandonmentCleanupTask);
    session.abandonmentCleanupTask = undefined;
  }
}

async function abandonSession(session: E2BSandboxSession) {
  clearAbandonmentCheck(session);

  const abandonedAt = new Date().toISOString();
  session.abandonedAt = abandonedAt;
  session.message = "This preview was closed after 10 minutes without activity.";
  session.cancelRequested = true;
  appendLog(session, "\nNo heartbeat received for 10 minutes. Automatically stopping sandbox.\n");

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
    appendLog(session, "Sandbox stopped after inactivity.\n");
  } catch (error) {
    if (isSandboxNotFoundError(error)) {
      session.status = "stopped";
      session.previewState = "offline";
      session.previewMessage = "Preview closed after 10 minutes without activity.";
      session.startupStage = undefined;
      session.startupMessage = undefined;
      session.sandbox = undefined;
      session.previewProcessId = undefined;
      appendLog(session, "Sandbox was already gone during inactivity cleanup.\n");
      return;
    }

    session.status = "error";
    session.previewState = "offline";
    session.previewMessage = "Preview closed after 10 minutes without activity.";
    session.message = `This preview was closed after 10 minutes without activity.\n${describeError(error)}`;
    appendLog(session, `Automatic inactivity cleanup failed: ${describeError(error)}\n`);
  }
}

function scheduleAbandonmentCheck(session: E2BSandboxSession) {
  clearAbandonmentCheck(session);

  session.abandonmentCleanupTask = setTimeout(() => {
    void (async () => {
      const lastHeartbeatAt = session.lastHeartbeatAt ? new Date(session.lastHeartbeatAt).getTime() : 0;
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

function recordSessionHeartbeat(sessionId: string) {
  const session = sessions.get(sessionId);
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

function assertSessionActive(session: E2BSandboxSession) {
  if (session.cancelRequested) {
    throw new SessionCancelledError();
  }
}

function applySandboxInfo(session: E2BSandboxSession, info: Pick<SandboxInfo, "startedAt" | "endAt">) {
  session.startedAt = info.startedAt.toISOString();
  session.endAt = info.endAt.toISOString();
}

async function refreshSandboxInfo(session: E2BSandboxSession) {
  if (!session.sandbox) return;

  try {
    applySandboxInfo(session, await session.sandbox.getInfo({ requestTimeoutMs: 10_000 }));
  } catch (error) {
    if (isSandboxNotFoundError(error)) {
      sessions.delete(session.sessionId);
      throw new SandboxExpiredError();
    }

    throw error;
  }
}

async function verifySandboxHealth(session: E2BSandboxSession) {
  await refreshSandboxInfo(session);
}

function toSandboxListItem(info: SandboxInfo): SandboxListItem {
  return {
    sandboxId: info.sandboxId,
    state: info.state,
    startedAt: info.startedAt.toISOString(),
    endAt: info.endAt.toISOString(),
    remainingMs: Math.max(0, info.endAt.getTime() - Date.now()),
    sessionId: info.metadata.sessionId,
  };
}

async function runStep(session: E2BSandboxSession, cmd: string, timeoutMs: number, cwd = PROJECT_DIR) {
  appendLog(session, `\n$ ${cmd}\n`);
  await session.sandbox?.commands.run(cmd, {
    cwd,
    timeoutMs,
    onStdout: (data: string) => appendLog(session, data),
    onStderr: (data: string) => appendLog(session, data),
  });
}

function getPreviewVersionUrl(session: E2BSandboxSession) {
  return `${session.previewUrl.replace(/\/$/, "")}/${PREVIEW_VERSION_PATH}`;
}

async function fetchPreviewVersion(session: E2BSandboxSession) {
  try {
    const response = await fetch(`${getPreviewVersionUrl(session)}?t=${Date.now()}`, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });

    if (!response.ok) return null;

    const version = (await response.text()).trim();
    return version || null;
  } catch {
    return null;
  }
}

async function waitForPreview(
  session: E2BSandboxSession,
  expectedVersion?: string,
  options: { timeoutMs?: number; retryDelayMs?: number; offlineMessage?: string } = {},
) {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? STARTUP_PREVIEW_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? PREVIEW_RETRY_DELAY_MS;
  let lastObservedVersion: string | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(session.previewUrl, {
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });

      if (!response.ok) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }

      const observedVersion = await fetchPreviewVersion(session);
      if (observedVersion) {
        session.previewObservedVersion = observedVersion;
        lastObservedVersion = observedVersion;
      }

      if (!expectedVersion || observedVersion === expectedVersion) {
        if (!session.previewVersion && observedVersion) {
          session.previewVersion = observedVersion;
        }
        setPreviewState(session, "ready", "Preview ready.");
        return true;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  if (expectedVersion && lastObservedVersion && lastObservedVersion !== expectedVersion) {
    setPreviewState(session, "stale", "Change saved. Refresh the preview tab if it still looks old.");
    appendLog(
      session,
      `\nPreview is reachable but still serving ${lastObservedVersion} instead of ${expectedVersion}. Refresh may be needed.\n`,
    );
    return false;
  }

  setPreviewState(session, "offline", options.offlineMessage ?? "Preview unavailable. Restart the preview.");
  appendLog(session, "\nPreview did not respond before the readiness timeout. The URL may still become available.\n");
  return false;
}

async function stopPreviewProcess(session: E2BSandboxSession) {
  if (!session.sandbox || !session.previewProcessId) return false;

  try {
    const killed = await session.sandbox.commands.kill(session.previewProcessId, { requestTimeoutMs: 10_000 });
    if (killed) {
      appendLog(session, `Stopped preview process ${session.previewProcessId}\n`);
    }
    session.previewProcessId = undefined;
    return killed;
  } catch {
    session.previewProcessId = undefined;
    return false;
  }
}

function buildPreviewVersion(variant: string) {
  return `${variant}-${Date.now()}`;
}

async function confirmPreviewVersion(session: E2BSandboxSession) {
  return waitForPreview(session, session.previewVersion, {
    timeoutMs: EDIT_PREVIEW_TIMEOUT_MS,
    offlineMessage: "Preview unavailable after the change. Restart the preview.",
  });
}

async function restartPreviewServer(session: E2BSandboxSession, reason = "Restarting") {
  setPreviewState(session, "recovering", "Preview reconnecting.");
  await stopPreviewProcess(session);
  await startPreviewServer(session, reason);
}

async function syncPreviewHealth(session: E2BSandboxSession) {
  const processRunning = await isPreviewProcessRunning(session);

  if (!processRunning) {
    setPreviewState(session, "offline", "Preview offline. Restarting now.");
    return false;
  }

  const urlReachable = await isPreviewUrlReachable(session);
  if (!urlReachable) {
    setPreviewState(session, "recovering", "Preview reconnecting.");
    return false;
  }

  const observedVersion = await fetchPreviewVersion(session);
  if (observedVersion) {
    session.previewObservedVersion = observedVersion;
    if (!session.previewVersion) {
      session.previewVersion = observedVersion;
    }
  }

  if (session.previewVersion && observedVersion && observedVersion !== session.previewVersion) {
    setPreviewState(session, "stale", "Change saved. Refresh the preview tab if it still looks old.");
    return true;
  }

  setPreviewState(session, "ready", "Preview ready.");
  return true;
}

async function ensurePreviewServer(session: E2BSandboxSession) {
  if (!session.sandbox || session.status !== "running") return;
  if (session.restartingPreview) {
    await session.restartingPreview;
    return;
  }

  const healthy = await syncPreviewHealth(session);
  if (healthy) return;

  const restart = async () => {
    appendLog(session, `\nPreview health check failed. Restarting preview server on port ${PREVIEW_PORT}...\n`);

    try {
      await restartPreviewServer(session);
      const recovered = await waitForPreview(session, session.previewVersion, {
        timeoutMs: RESTART_PREVIEW_TIMEOUT_MS,
      });
      if (recovered) {
        appendLog(session, "Preview server recovered.\n");
        return;
      }

      if (session.previewState === "stale") {
        appendLog(session, "Preview server is up, but the latest change has not appeared yet.\n");
        return;
      }

      appendLog(session, "Preview restart failed to recover. Checking sandbox health...\n");
      await verifySandboxHealth(session);
      setPreviewState(session, "offline", "Preview unavailable. Restart the preview.");
      appendLog(session, "Preview restart finished but the preview is still unavailable.\n");
    } catch (error) {
      appendLog(session, "Preview recovery failed. Checking sandbox health...\n");
      await verifySandboxHealth(session);
      setPreviewState(session, "offline", "Preview unavailable. Restart the preview.");
      appendLog(session, `Preview restart failed: ${describeError(error)}\n`);
      throw error;
    }
  };

  session.restartingPreview = restart().finally(() => {
    session.restartingPreview = undefined;
  });

  await session.restartingPreview;
}

async function startPreviewServer(session: E2BSandboxSession, reason = "Starting") {
  if (!session.sandbox) throw new Error("Sandbox is not ready.");

  appendLog(session, `\n${reason} Vite preview server on port ${PREVIEW_PORT}...\n`);
  appendLog(session, `$ npm run dev -- --host 0.0.0.0 --port ${PREVIEW_PORT}\n`);

  const command = (await session.sandbox.commands.run(`npm run dev -- --host 0.0.0.0 --port ${PREVIEW_PORT}`, {
    cwd: PROJECT_DIR,
    background: true,
    onStdout: (data: string) => appendLog(session, data),
    onStderr: (data: string) => appendLog(session, data),
  })) as CommandHandle;

  session.previewProcessId = command.pid;
  appendLog(session, `Preview process started with pid ${command.pid}\n`);
}

async function isPreviewProcessRunning(session: E2BSandboxSession) {
  if (!session.sandbox || !session.previewProcessId) return false;

  const processes = await session.sandbox.commands.list({ requestTimeoutMs: 10_000 });
  return processes.some((process) => process.pid === session.previewProcessId);
}

async function isPreviewUrlReachable(session: E2BSandboxSession) {
  try {
    const response = await fetch(session.previewUrl, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function bootstrapSandboxSession(session: E2BSandboxSession) {
  requireApiKey();

  const Sandbox = await getSandboxCtor();

  try {
    assertSessionActive(session);
    setStartupStage(session, "creating", "Creating preview");
    session.status = "starting";
    appendLog(session, "Creating E2B sandbox...\n");
    const sandbox = await Sandbox.create("base", {
      timeoutMs: SANDBOX_TIMEOUT_MS,
      metadata: {
        app: SANDBOX_METADATA_APP,
        sessionId: session.sessionId,
      },
    });

    if (session.cancelRequested) {
      await sandbox.kill({ requestTimeoutMs: 30_000 });
      throw new SessionCancelledError();
    }

    session.sandbox = sandbox;
    session.sandboxId = sandbox.sandboxId;
    session.previewUrl = normalizePreviewUrl(sandbox.getHost(PREVIEW_PORT));
    session.status = "installing";
    await refreshSandboxInfo(session);

    assertSessionActive(session);
    setStartupStage(session, "scaffolding", "Preparing the React app");
    await runStep(
      session,
      `npm create vite@${CREATE_VITE_VERSION} devin-e2b-preview -- --template react-ts`,
      120_000,
      "/home/user",
    );

    assertSessionActive(session);
    setStartupStage(session, "installing", "Installing app");
    await runStep(session, "npm install", 180_000);

    assertSessionActive(session);
    setStartupStage(session, "seeding", "Applying starter design");
    await writeViteConfig(session);
    await applySandboxVariant(session.sessionId, "launch", { ensurePreview: false });

    assertSessionActive(session);
    setStartupStage(session, "starting-preview", "Starting preview");
    await verifySandboxHealth(session);
    await startPreviewServer(session);
    const previewReady = await waitForPreview(session, session.previewVersion, {
      timeoutMs: STARTUP_PREVIEW_TIMEOUT_MS,
    });
    if (!previewReady) {
      throw new Error("Preview did not become ready.");
    }
    session.status = "running";
    setStartupStage(session, "ready", "Preview ready");
    appendLog(session, `\nPreview ready: ${session.previewUrl}\n`);
  } catch (error) {
    if (error instanceof SessionCancelledError) {
      appendLog(session, "Startup cancelled.\n");
      return;
    }

    const failureMessage = describeError(error);
    session.message = failureMessage;
    appendLog(session, `\nError: ${failureMessage}\n`);

    if (session.sandbox) {
      appendLog(session, "Startup failed after sandbox creation. Attempting automatic cleanup...\n");
      clearAbandonmentCheck(session);

      try {
        await session.sandbox.kill({ requestTimeoutMs: 30_000 });
        session.status = "stopped";
        session.message = `Startup failed. The sandbox was cleaned up automatically.\n${failureMessage}`;
        setStartupStage(session, "error", "Startup failed. The sandbox was cleaned up automatically.");
        session.sandbox = undefined;
        session.previewProcessId = undefined;
        appendLog(session, "Automatic startup cleanup succeeded.\n");
      } catch (cleanupError) {
        session.status = "error";
        session.message = `Startup failed and automatic cleanup did not complete.\n${failureMessage}`;
        setStartupStage(session, "error", "Startup failed and automatic cleanup did not complete.");
        appendLog(session, `Automatic startup cleanup failed: ${describeError(cleanupError)}\n`);
      }

      return;
    }

    session.status = "error";
    setStartupStage(session, "error", "Unable to start preview");
  }
}

async function createSandboxSession() {
  requireApiKey();

  const sessionId = crypto.randomUUID();
  const session: E2BSandboxSession = {
    sessionId,
    sandboxId: "creating",
    previewUrl: "",
    status: "starting",
    logs: [],
    previewState: "offline",
    previewMessage: "Preview not started yet.",
    startupStage: "creating",
    startupMessage: "Creating preview",
    lastHeartbeatAt: new Date().toISOString(),
  };

  sessions.set(sessionId, session);
  scheduleAbandonmentCheck(session);
  session.startupTask = bootstrapSandboxSession(session).finally(() => {
    session.startupTask = undefined;
  });

  return publicSession(session);
}

function getSandboxSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  return publicSession(session);
}

function heartbeatSandboxSession(sessionId: string) {
  const session = recordSessionHeartbeat(sessionId);
  if (!session) return null;
  return publicSession(session);
}

export async function restoreSandboxSession({ sessionId, sandboxId }: RestoreSessionInput) {
  requireApiKey();

  const existing = sessions.get(sessionId);
  if (existing) {
    recordSessionHeartbeat(sessionId);
    if (existing.status === "stopped" || existing.status === "error") {
      return publicSession(existing);
    }
    await verifySandboxHealth(existing);
    await ensurePreviewServer(existing);
    if (existing.previewVersion) {
      await waitForPreview(existing, existing.previewVersion, {
        timeoutMs: RESTORE_PREVIEW_TIMEOUT_MS,
        offlineMessage: "Preview unavailable while restoring the session.",
      });
    }
    return publicSession(existing);
  }

  const Sandbox = await getSandboxCtor();
  let sandbox: E2BSandbox;

  try {
    sandbox = await Sandbox.connect(sandboxId, { timeoutMs: SANDBOX_TIMEOUT_MS });
  } catch (error) {
    if (isSandboxNotFoundError(error)) {
      sessions.delete(sessionId);
      throw new SandboxExpiredError();
    }

    throw error;
  }

  const session: E2BSandboxSession = {
    sessionId,
    sandboxId,
    previewUrl: normalizePreviewUrl(sandbox.getHost(PREVIEW_PORT)),
    status: "running",
    logs: ["Reconnected to existing E2B sandbox.\n"],
    previewState: "recovering",
    previewMessage: "Checking preview health.",
    startupStage: "ready",
    startupMessage: "Preview ready",
    sandbox,
    lastHeartbeatAt: new Date().toISOString(),
  };

  sessions.set(sessionId, session);
  scheduleAbandonmentCheck(session);
  await verifySandboxHealth(session);

  const processes = await sandbox.commands.list({ requestTimeoutMs: 10_000 });
  const viteProcess = processes.find((process) => process.cwd === PROJECT_DIR && process.cmd.includes("npm"));
  session.previewProcessId = viteProcess?.pid;

  await ensurePreviewServer(session);
  if (session.previewVersion) {
    await waitForPreview(session, session.previewVersion, {
      timeoutMs: RESTORE_PREVIEW_TIMEOUT_MS,
      offlineMessage: "Preview unavailable while restoring the session.",
    });
  }
  return publicSession(session);
}

export async function listSandboxSessions() {
  requireApiKey();

  const Sandbox = await getSandboxCtor();
  const paginator = Sandbox.list({
    limit: 100,
    query: {
      metadata: {
        app: SANDBOX_METADATA_APP,
      },
      state: ["running", "paused"],
    },
  });

  const sandboxes: SandboxListItem[] = [];

  while (paginator.hasNext) {
    const items = await paginator.nextItems();
    sandboxes.push(...items.map(toSandboxListItem));
  }

  return sandboxes;
}

export async function cleanupSandboxSession(sandboxId: string) {
  requireApiKey();

  const Sandbox = await getSandboxCtor();
  let info: SandboxInfo;

  try {
    info = await Sandbox.getInfo(sandboxId, { requestTimeoutMs: 10_000 });
  } catch (error) {
    if (isSandboxNotFoundError(error)) {
      return { killed: false, sandboxId, message: "Sandbox was already gone." };
    }

    throw error;
  }

  if (info.metadata.app !== SANDBOX_METADATA_APP) {
    throw new Error("Refusing to kill sandbox because it was not created by this app.");
  }

  const killed = await Sandbox.kill(sandboxId, { requestTimeoutMs: 30_000 });

  for (const [sessionId, session] of sessions.entries()) {
    if (session.sandboxId === sandboxId) {
      clearAbandonmentCheck(session);
      session.status = "stopped";
      appendLog(session, "Sandbox killed from cleanup panel.\n");
      sessions.delete(sessionId);
    }
  }

  return { killed, sandboxId, message: killed ? "Sandbox killed." : "Sandbox was already gone." };
}

async function stopSandboxSession({ sessionId, environmentId }: StopSandboxSessionInput) {
  requireApiKey();

  const sandboxId = environmentId;
  const session = sessions.get(sessionId);
  if (!session) {
    if (!sandboxId) throw new Error("Session not found.");

    const Sandbox = await getSandboxCtor();
    try {
      await Sandbox.kill(sandboxId, { requestTimeoutMs: 30_000 });
    } catch (error) {
      if (!isSandboxNotFoundError(error)) throw error;
    }

    sessions.delete(sessionId);
    return stoppedSession(sessionId, sandboxId, ["Killed sandbox using saved sandbox ID.\n"]);
  }

  try {
    session.cancelRequested = true;
    clearAbandonmentCheck(session);
    if (session.sandbox && session.status !== "stopped") {
      appendLog(session, "\nKilling E2B sandbox...\n");
      await session.sandbox.kill({ requestTimeoutMs: 30_000 });
    }
    session.status = "stopped";
    session.startupStage = undefined;
    session.startupMessage = undefined;
    session.sandbox = undefined;
    session.previewProcessId = undefined;
    appendLog(session, "Sandbox stopped.\n");
    sessions.delete(sessionId);
  } catch (error) {
    if (isSandboxNotFoundError(error)) {
      session.status = "stopped";
      appendLog(session, "Sandbox was already gone.\n");
      sessions.delete(sessionId);
      return publicSession(session);
    }

    session.status = "error";
    session.message = error instanceof Error ? error.message : "Unable to stop sandbox.";
    throw error;
  }

  return publicSession(session);
}

async function restartSandboxPreview(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session?.sandbox) throw new Error("Session not found.");
  if (session.status === "stopped") throw new Error("Sandbox is already stopped.");

  recordSessionHeartbeat(sessionId);

  appendLog(session, "\nManual preview restart requested.\n");
  session.restartingPreview = restartPreviewServer(session, "Restarting").finally(() => {
    session.restartingPreview = undefined;
  });
  await session.restartingPreview;
  await verifySandboxHealth(session);
  await waitForPreview(session, session.previewVersion, {
    timeoutMs: RESTART_PREVIEW_TIMEOUT_MS,
  });

  return publicSession(session);
}

export const e2bSandboxProvider: SandboxProvider = {
  get: getSandboxSession,
  heartbeat: heartbeatSandboxSession,
  restartPreview: restartSandboxPreview,
  start: createSandboxSession,
  stop: stopSandboxSession,
};

async function recoverPreviewAfterEdit(session: E2BSandboxSession) {
  const processAliveAfterWrite = await isPreviewProcessRunning(session);
  appendLog(session, `Preview process after write: ${processAliveAfterWrite ? "running" : "stopped"}\n`);

  const urlReachableAfterWrite = processAliveAfterWrite ? await isPreviewUrlReachable(session) : false;
  appendLog(session, `Preview URL after write: ${urlReachableAfterWrite ? "reachable" : "unreachable"}\n`);

  if (!processAliveAfterWrite || !urlReachableAfterWrite) {
    appendLog(session, "Edit detected preview failure. Attempting one automatic restart...\n");

    try {
      await restartPreviewServer(session, "Restarting");
      const recovered = await waitForPreview(session, session.previewVersion, {
        timeoutMs: RESTART_PREVIEW_TIMEOUT_MS,
        offlineMessage: "Preview crashed after the change and did not recover.",
      });
      appendLog(session, `Automatic restart result: ${recovered ? "recovered" : "not recovered"}\n`);
      return recovered;
    } catch (error) {
      appendLog(session, `Automatic restart failed: ${describeError(error)}\n`);
      await verifySandboxHealth(session);
      setPreviewState(session, "offline", "Preview crashed after the change. Restart the preview.");
      return false;
    }
  }

  const fresh = await waitForPreview(session, session.previewVersion, {
    timeoutMs: EDIT_PREVIEW_TIMEOUT_MS,
    offlineMessage: "Preview unavailable after the change. Restart the preview.",
  });
  appendLog(session, `Edit freshness result: ${fresh ? "matched latest version" : session.previewState}\n`);
  return fresh;
}

export async function applySandboxVariant(
  sessionId: string,
  variant: string,
  options: { ensurePreview?: boolean } = {},
) {
  const session = sessions.get(sessionId);
  if (!session?.sandbox) throw new Error("Session not found.");
  if (session.status === "stopped") throw new Error("Sandbox is already stopped.");

  recordSessionHeartbeat(sessionId);

  if (options.ensurePreview ?? true) {
    await ensurePreviewServer(session);
  }

  const processAliveBeforeWrite = await isPreviewProcessRunning(session);
  appendLog(session, `Preview process before write: ${processAliveBeforeWrite ? "running" : "stopped"}\n`);

  const files = getVariantFiles(variant);
  const previewVersion = buildPreviewVersion(variant);
  session.previewVersion = previewVersion;
  appendLog(session, `\nApplying ${files.label} variant...\n`);
  await session.sandbox.files.write(`${PROJECT_DIR}/src/App.tsx`, files.app(previewVersion));
  await session.sandbox.files.write(`${PROJECT_DIR}/src/App.css`, files.css);
  await session.sandbox.files.write(`${PROJECT_DIR}/public/${PREVIEW_VERSION_PATH}`, `${previewVersion}\n`);
  appendLog(session, "Wrote src/App.tsx and src/App.css\n");
  appendLog(session, `Updated preview version marker to ${previewVersion}\n`);

  if (options.ensurePreview ?? true) {
    setPreviewState(session, "recovering", "Saving change and refreshing preview.");
    await recoverPreviewAfterEdit(session);
  }

  return publicSession(session);
}

async function writeViteConfig(session: E2BSandboxSession) {
  if (!session.sandbox) throw new Error("Sandbox is not ready.");

  await session.sandbox.commands.run("mkdir -p public", { cwd: PROJECT_DIR, timeoutMs: 10_000 });
  appendLog(session, "\nWriting Vite preview config...\n");
  await session.sandbox.files.write(
    `${PROJECT_DIR}/vite.config.ts`,
    `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: ${PREVIEW_PORT},
    strictPort: true,
    allowedHosts: [".e2b.app"],
  },
});
`,
  );
  appendLog(session, "Wrote vite.config.ts with fixed preview port for E2B\n");
}

function getVariantFiles(variant: string) {
  const variants = {
    launch: {
      label: "Launch",
      app: (previewVersion: string) =>
        makeApp(previewVersion, "Launch Console", "Ship a React surface from inside an E2B sandbox.", [
        ["Runtime", "Vite on port 5173"],
        ["Edit path", "src/App.tsx"],
        ["Preview", "E2B getHost URL"],
        ]),
      css: makeCss("#101014", "#28d17c", "#ff5f48", "#f8f7f2"),
    },
    studio: {
      label: "Studio",
      app: (previewVersion: string) =>
        makeApp(previewVersion, "Design Studio", "A sandboxed canvas where each button rewrites the React project.", [
        ["Mode", "Deterministic"],
        ["Refresh", "Preview URL"],
        ["Lifecycle", "Ephemeral"],
        ]),
      css: makeCss("#172018", "#f3b61f", "#2457ff", "#f7f3ff"),
    },
    metrics: {
      label: "Metrics",
      app: (previewVersion: string) =>
        makeApp(previewVersion, "Telemetry Wall", "The running app keeps its URL while the code changes underneath.", [
        ["Sandbox", "Live"],
        ["Server", "0.0.0.0"],
        ["Timeout", "30 minutes"],
        ]),
      css: makeCss("#151515", "#7ee7ff", "#ff5f48", "#f2fff8"),
    },
  } as const;

  return variants[variant as keyof typeof variants] ?? variants.launch;
}

function makeApp(previewVersion: string, title: string, subtitle: string, stats: [string, string][]) {
  return `import "./App.css";

const stats = [
${stats.map(([label, value]) => `  { label: ${JSON.stringify(label)}, value: ${JSON.stringify(value)} },`).join("\n")}
];
const previewVersion = ${JSON.stringify(previewVersion)};

function App() {
  return (
    <main className="sandbox-page" data-preview-version={previewVersion}>
      <section className="hero">
        <p className="tag">E2B preview</p>
        <h1>${title}</h1>
        <p className="lede">${subtitle}</p>
        <p className="version">Preview version {previewVersion}</p>
        <div className="stats">
          {stats.map((stat) => (
            <article key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
`;
}

function makeCss(ink: string, accent: string, secondary: string, paper: string) {
  return `:root {
  color: ${ink};
  background: ${paper};
  font-family: "Avenir Next", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

.sandbox-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px;
  background:
    linear-gradient(90deg, color-mix(in srgb, ${ink} 8%, transparent) 1px, transparent 1px),
    linear-gradient(color-mix(in srgb, ${ink} 8%, transparent) 1px, transparent 1px),
    ${paper};
  background-size: 34px 34px;
}

.hero {
  width: min(980px, 100%);
  border: 3px solid ${ink};
  background: white;
  box-shadow: 12px 12px 0 ${ink};
  padding: clamp(28px, 7vw, 72px);
}

.tag {
  display: inline-flex;
  margin: 0 0 20px;
  border: 2px solid ${ink};
  background: ${accent};
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
}

h1 {
  max-width: 760px;
  margin: 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(48px, 10vw, 104px);
  line-height: 0.9;
  letter-spacing: 0;
}

.lede {
  max-width: 680px;
  margin: 24px 0 0;
  font-size: clamp(18px, 2.4vw, 28px);
  line-height: 1.2;
}

.version {
  margin: 18px 0 0;
  font-size: 13px;
  font-weight: 900;
  text-transform: uppercase;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 42px;
}

article {
  border: 2px solid ${ink};
  background: ${secondary};
  color: white;
  min-height: 118px;
  padding: 16px;
}

article span {
  display: block;
  margin-bottom: 12px;
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
}

article strong {
  display: block;
  overflow-wrap: anywhere;
  font-size: 22px;
  line-height: 1.05;
}

@media (max-width: 720px) {
  .stats {
    grid-template-columns: 1fr;
  }
}
`;
}
