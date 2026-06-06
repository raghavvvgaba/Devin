import type { Sandbox as E2BSandbox, SandboxInfo } from "e2b";

import { getRepoInstallationAccessToken } from "~/server/github/app-auth";
import {
  PREVIEW_PORT,
  PROJECT_DIR,
  RESTART_PREVIEW_TIMEOUT_MS,
  RESTORE_PREVIEW_TIMEOUT_MS,
  SANDBOX_METADATA_APP,
  SANDBOX_TIMEOUT_MS,
  STARTUP_PREVIEW_TIMEOUT_MS,
} from "~/server/sandbox/providers/e2b/constants";
import { detectRepoPreviewConfig } from "~/server/sandbox/providers/e2b/repo-detect";
import {
  ensurePreviewServer,
  restartPreviewServer,
  startPreviewServer,
  waitForPreview,
} from "~/server/sandbox/providers/e2b/preview";
import {
  SandboxExpiredError,
  SessionCancelledError,
  appendLog,
  assertSessionActive,
  clearAbandonmentCheck,
  deleteTrackedSession,
  describeSessionError,
  getTrackedSession,
  isSandboxNotFoundError,
  publicSession,
  recordSessionHeartbeat,
  scheduleAbandonmentCheck,
  setPreviewState,
  setStartupStage,
  setTrackedSession,
  stoppedSession,
  trackedSessions,
} from "~/server/sandbox/providers/e2b/session-state";
import {
  getSandboxCtor,
  normalizePreviewUrl,
  refreshSandboxInfo,
  requireApiKey,
  runStep,
  toSandboxListItem,
  verifySandboxHealth,
} from "~/server/sandbox/providers/e2b/sandbox-ops";
import type {
  E2BSandboxSession,
  RestoreSessionInput,
  StartSessionInput,
} from "~/server/sandbox/providers/e2b/types";
import type {
  SandboxProvider,
  StopSandboxSessionInput,
} from "~/server/sandbox/types";

async function getRepositoryCloneToken(input: StartSessionInput) {
  const token = await getRepoInstallationAccessToken(input.repoOwner, input.repoName);

  if (!token) {
    throw new Error("Unable to access this repository with the GitHub App installation.");
  }

  return token;
}

async function cloneRepository(
  session: E2BSandboxSession,
  input: StartSessionInput,
  token: string,
) {
  const safeRepoUrl = `https://github.com/${input.repoOwner}/${input.repoName}.git`;
  const authenticatedRepoUrl = `https://x-access-token:${encodeURIComponent(token)}@github.com/${input.repoOwner}/${input.repoName}.git`;
  session.sensitiveLogValues = [
    ...(session.sensitiveLogValues ?? []),
    token,
    encodeURIComponent(token),
    authenticatedRepoUrl,
  ];

  await runStep(session, {
    command: `git clone ${authenticatedRepoUrl} repo`,
    cwd: "/home/user",
    displayCommand: `git clone ${safeRepoUrl} repo`,
    timeoutMs: 120_000,
  });
}

async function bootstrapSandboxSession(
  session: E2BSandboxSession,
  input: StartSessionInput,
) {
  requireApiKey();

  const Sandbox = await getSandboxCtor();

  try {
    const cloneToken = await getRepositoryCloneToken(input);
    session.sensitiveLogValues = [
      ...(session.sensitiveLogValues ?? []),
      cloneToken,
      encodeURIComponent(cloneToken),
    ];

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
    setStartupStage(session, "scaffolding", "Cloning repository");
    await cloneRepository(session, input, cloneToken);

    assertSessionActive(session);
    setStartupStage(session, "installing", "Detecting repository type");
    const previewConfig = await detectRepoPreviewConfig(session);
    session.repoKind = previewConfig.kind;
    session.previewCommand = previewConfig.previewCommand;
    session.previewCwd = previewConfig.previewCwd;

    if (previewConfig.prepareCommand) {
      assertSessionActive(session);
      setStartupStage(session, "installing", "Preparing package manager");
      await runStep(session, {
        command: previewConfig.prepareCommand,
        timeoutMs: 120_000,
      });
    }

    if (previewConfig.installCommand) {
      assertSessionActive(session);
      setStartupStage(session, "installing", "Installing dependencies");
      await runStep(session, {
        command: previewConfig.installCommand,
        timeoutMs: 240_000,
      });
    } else {
      appendLog(
        session,
        "\nStatic HTML/CSS/JS repository detected. Skipping dependency install.\n",
      );
    }

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

    const failureMessage = describeSessionError(session, error);
    session.message = failureMessage;
    appendLog(session, `\nError: ${failureMessage}\n`);

    if (session.sandbox) {
      appendLog(
        session,
        "Startup failed after sandbox creation. Attempting automatic cleanup...\n",
      );
      clearAbandonmentCheck(session);

      try {
        await session.sandbox.kill({ requestTimeoutMs: 30_000 });
        session.status = "stopped";
        session.message = `Startup failed. The sandbox was cleaned up automatically.\n${failureMessage}`;
        setStartupStage(
          session,
          "error",
          "Startup failed. The sandbox was cleaned up automatically.",
        );
        session.sandbox = undefined;
        session.previewProcessId = undefined;
        appendLog(session, "Automatic startup cleanup succeeded.\n");
      } catch (cleanupError) {
        session.status = "error";
        session.message = `Startup failed and automatic cleanup did not complete.\n${failureMessage}`;
        setStartupStage(
          session,
          "error",
          "Startup failed and automatic cleanup did not complete.",
        );
        appendLog(
          session,
          `Automatic startup cleanup failed: ${describeSessionError(
            session,
            cleanupError,
          )}\n`,
        );
      }

      return;
    }

    session.status = "error";
    setStartupStage(session, "error", "Unable to start preview");
  }
}

export async function createSandboxSession(input: StartSessionInput) {
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

  setTrackedSession(session);
  scheduleAbandonmentCheck(session);
  session.startupTask = bootstrapSandboxSession(session, input).finally(() => {
    session.startupTask = undefined;
  });

  return publicSession(session);
}

export function getSandboxSession(sessionId: string) {
  const session = getTrackedSession(sessionId);
  if (!session) return null;
  return publicSession(session);
}

export function heartbeatSandboxSession(sessionId: string) {
  const session = recordSessionHeartbeat(sessionId);
  if (!session) return null;
  return publicSession(session);
}

export async function restoreSandboxSession({
  sessionId,
  sandboxId,
}: RestoreSessionInput) {
  requireApiKey();

  const existing = getTrackedSession(sessionId);
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
      deleteTrackedSession(sessionId);
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

  setTrackedSession(session);
  scheduleAbandonmentCheck(session);
  await verifySandboxHealth(session);

  try {
    const previewConfig = await detectRepoPreviewConfig(session);
    session.repoKind = previewConfig.kind;
    session.previewCommand = previewConfig.previewCommand;
    session.previewCwd = previewConfig.previewCwd;
  } catch (error) {
    appendLog(
      session,
      `Unable to restore preview configuration: ${describeSessionError(
        session,
        error,
      )}\n`,
    );
  }

  const processes = await sandbox.commands.list({ requestTimeoutMs: 10_000 });
  const previewProcess = processes.find(
    (process) =>
      process.cwd === PROJECT_DIR &&
      process.cmd.includes(String(PREVIEW_PORT)),
  );
  session.previewProcessId = previewProcess?.pid;

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

  const sandboxes = [];

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

  for (const [sessionId, session] of trackedSessions.entries()) {
    if (session.sandboxId === sandboxId) {
      clearAbandonmentCheck(session);
      session.status = "stopped";
      appendLog(session, "Sandbox killed from cleanup panel.\n");
      deleteTrackedSession(sessionId);
    }
  }

  return {
    killed,
    sandboxId,
    message: killed ? "Sandbox killed." : "Sandbox was already gone.",
  };
}

export async function stopSandboxSession({
  sessionId,
  environmentId,
}: StopSandboxSessionInput) {
  requireApiKey();

  const sandboxId = environmentId;
  const session = getTrackedSession(sessionId);
  if (!session) {
    if (!sandboxId) throw new Error("Session not found.");

    const Sandbox = await getSandboxCtor();
    try {
      await Sandbox.kill(sandboxId, { requestTimeoutMs: 30_000 });
    } catch (error) {
      if (!isSandboxNotFoundError(error)) throw error;
    }

    deleteTrackedSession(sessionId);
    return stoppedSession(sessionId, sandboxId, [
      "Killed sandbox using saved sandbox ID.\n",
    ]);
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
    deleteTrackedSession(sessionId);
  } catch (error) {
    if (isSandboxNotFoundError(error)) {
      session.status = "stopped";
      appendLog(session, "Sandbox was already gone.\n");
      deleteTrackedSession(sessionId);
      return publicSession(session);
    }

    session.status = "error";
    session.message =
      error instanceof Error ? error.message : "Unable to stop sandbox.";
    throw error;
  }

  return publicSession(session);
}

export async function restartSandboxPreview(sessionId: string) {
  const session = getTrackedSession(sessionId);
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

export const lifecycleProviderMethods: Pick<
  SandboxProvider,
  "get" | "heartbeat" | "restartPreview" | "start" | "stop"
> = {
  get: getSandboxSession,
  heartbeat: heartbeatSandboxSession,
  restartPreview: restartSandboxPreview,
  start: createSandboxSession,
  stop: stopSandboxSession,
};
