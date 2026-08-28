import type { Sandbox as E2BSandbox, SandboxInfo } from "e2b";

import { env } from "~/env";
import { getRepoInstallationAccessToken } from "~/server/github/app-auth";
import {
  createSandboxSessionRecord,
  getReusableProjectSandboxSession,
  getSandboxSessionRecordBySessionId,
  markSandboxSessionStopped,
  markSandboxSessionStoppedBySandboxId,
  toStoppedPublicSession,
  touchSandboxSessionHeartbeat,
} from "~/server/sandbox/session-registry";
import {
  PREVIEW_PORT,
  PROJECT_DIR,
  RESTART_PREVIEW_TIMEOUT_MS,
  SANDBOX_METADATA_APP,
  SANDBOX_TIMEOUT_MS,
  STARTUP_PREVIEW_TIMEOUT_MS,
  UNSUPPORTED_FULL_STACK_REPO_MESSAGE,
  UNSUPPORTED_NESTED_APP_REPO_MESSAGE,
  UNSUPPORTED_REPO_MESSAGE,
  UNSUPPORTED_WORKSPACE_REPO_MESSAGE,
} from "~/server/sandbox/providers/e2b/constants";
import { detectRepoPreviewConfig } from "~/server/sandbox/providers/e2b/repo-detect";
import {
  checkPreviewContentForDiagnostics,
  ensurePreviewServer,
  restartPreviewServer,
  startPreviewServer,
  syncPreviewHealth,
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
  setPreviewError,
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
import type { SandboxFailureCode } from "~/server/sandbox/types";
import type {
  SandboxProvider,
  StopSandboxSessionInput,
} from "~/server/sandbox/types";

const FAILED_SESSION_RETENTION_MS = 60_000;

async function getRepositoryCloneToken(input: StartSessionInput) {
  const token = await getRepoInstallationAccessToken(
    input.repoOwner,
    input.repoName,
  );

  if (!token) {
    throw new Error(
      "Unable to access this repository with the GitHub App installation.",
    );
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

async function continueSandboxStartup(
  session: E2BSandboxSession,
  input: StartSessionInput,
) {
  try {
    const cloneToken = await getRepositoryCloneToken(input);
    session.sensitiveLogValues = [
      ...(session.sensitiveLogValues ?? []),
      cloneToken,
      encodeURIComponent(cloneToken),
    ];

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
    const previewReady = await waitForPreview(session, {
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
    const unsupportedMessages = [
      UNSUPPORTED_FULL_STACK_REPO_MESSAGE,
      UNSUPPORTED_NESTED_APP_REPO_MESSAGE,
      UNSUPPORTED_REPO_MESSAGE,
      UNSUPPORTED_WORKSPACE_REPO_MESSAGE,
    ];
    const failureCode: SandboxFailureCode = unsupportedMessages.some((message) =>
      failureMessage.includes(message),
    )
      ? "unsupported_repository"
      : "startup_failed";
    session.failureCode = failureCode;
    session.failureMessage = failureMessage;
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
    } else {
      session.status = "error";
      setStartupStage(session, "error", "Unable to start preview");
    }

    try {
      await markSandboxSessionStopped(session.sessionId);
    } catch (persistenceError) {
      appendLog(
        session,
        `Unable to mark failed sandbox session as stopped: ${describeSessionError(
          session,
          persistenceError,
        )}\n`,
      );
    }

    // Keep the terminal failure in memory briefly so the polling client can
    // display the modal. It is intentionally not restored after a refresh.
    setTimeout(() => {
      if (getTrackedSession(session.sessionId) === session) {
        deleteTrackedSession(session.sessionId);
      }
    }, FAILED_SESSION_RETENTION_MS);
  }
}

async function restoreActiveSandboxSession(sessionId: string) {
  const record = await getSandboxSessionRecordBySessionId(sessionId);

  if (!record) {
    return null;
  }

  if (record.isStopped) {
    return toStoppedPublicSession(record);
  }

  try {
    return await restoreSandboxSession({
      sandboxId: record.sandboxId,
      sessionId: record.sessionId,
    });
  } catch (error) {
    if (error instanceof SandboxExpiredError) {
      await markSandboxSessionStopped(sessionId);
      return null;
    }

    throw error;
  }
}

export async function getRunningSandboxToolSession(sessionId: string) {
  let session = getTrackedSession(sessionId);

  if (!session) {
    const restored = await restoreActiveSandboxSession(sessionId);

    if (!restored) {
      throw new Error("Session not found.");
    }

    session = getTrackedSession(sessionId);
  }

  if (!session?.sandbox) {
    throw new Error("Session not found.");
  }

  if (session.status !== "running") {
    throw new Error("Sandbox is not running.");
  }

  return session;
}

export async function createSandboxSession(input: StartSessionInput) {
  requireApiKey();

  const reusable = await getReusableProjectSandboxSession({
    projectId: input.projectId,
    userId: input.userId,
  });

  if (reusable) {
    const restored = await restoreActiveSandboxSession(reusable.sessionId);
    if (restored && restored.status !== "stopped") {
      return restored;
    }
  }

  const Sandbox = await getSandboxCtor();
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

  appendLog(
    session,
    `Creating E2B sandbox from ${env.E2B_SANDBOX_TEMPLATE}...\n`,
  );
  const sandbox = await Sandbox.create(env.E2B_SANDBOX_TEMPLATE, {
    metadata: {
      app: SANDBOX_METADATA_APP,
      sessionId,
    },
    timeoutMs: SANDBOX_TIMEOUT_MS,
  });

  if (session.cancelRequested) {
    await sandbox.kill({ requestTimeoutMs: 30_000 });
    throw new SessionCancelledError();
  }

  session.sandbox = sandbox;
  session.sandboxId = sandbox.sandboxId;
  session.previewUrl = normalizePreviewUrl(sandbox.getHost(PREVIEW_PORT));
  session.status = "installing";

  setTrackedSession(session);
  scheduleAbandonmentCheck(session);
  await refreshSandboxInfo(session);

  const startedAt = session.startedAt ? new Date(session.startedAt) : new Date();
  const lastHeartbeatAt = session.lastHeartbeatAt
    ? new Date(session.lastHeartbeatAt)
    : new Date();

  await createSandboxSessionRecord({
    lastHeartbeatAt,
    previewUrl: session.previewUrl,
    projectId: input.projectId,
    sandboxId: session.sandboxId,
    sessionId,
    startedAt,
    userId: input.userId,
  });

  session.startupTask = continueSandboxStartup(session, input).finally(() => {
    session.startupTask = undefined;
  });

  return publicSession(session);
}

export async function getSandboxSession(sessionId: string) {
  const session = getTrackedSession(sessionId);

  if (session) {
    return publicSession(session);
  }

  return restoreActiveSandboxSession(sessionId);
}

export async function heartbeatSandboxSession(sessionId: string) {
  let session = recordSessionHeartbeat(sessionId);

  if (!session) {
    const restored = await restoreActiveSandboxSession(sessionId);

    if (!restored) {
      return null;
    }

    if (restored.status === "stopped") {
      return restored;
    }

    session = recordSessionHeartbeat(sessionId);
  }

  if (!session) {
    return null;
  }

  if (
    session.lastHeartbeatAt &&
    session.status !== "stopped" &&
    session.status !== "error"
  ) {
    await touchSandboxSessionHeartbeat(
      session.sessionId,
      new Date(session.lastHeartbeatAt),
    );
  }

  if (session.status === "running") {
    try {
      await syncPreviewHealth(session);
    } catch {
      // Heartbeats keep the sandbox alive. A transient preview-health failure
      // must not turn that request into an empty platform-level 500 response.
    }
  }

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
  await refreshSandboxInfo(session);
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
    throw new Error(
      "Refusing to kill sandbox because it was not created by this app.",
    );
  }

  const killed = await Sandbox.kill(sandboxId, { requestTimeoutMs: 30_000 });
  await markSandboxSessionStoppedBySandboxId(sandboxId);

  for (const [sessionId, session] of trackedSessions.entries()) {
    if (session.sandboxId === sandboxId) {
      clearAbandonmentCheck(session);
      session.status = "stopped";
      setPreviewError(session);
      appendLog(session, "Sandbox killed from cleanup panel.\n");
      deleteTrackedSession(sessionId);
      await markSandboxSessionStopped(sessionId);
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

  const record = await getSandboxSessionRecordBySessionId(sessionId);
  const sandboxId = environmentId ?? record?.sandboxId;
  const session = getTrackedSession(sessionId);

  if (!session) {
    if (record?.isStopped) {
      return toStoppedPublicSession(record);
    }

    if (!sandboxId) throw new Error("Session not found.");

    const Sandbox = await getSandboxCtor();
    try {
      await Sandbox.kill(sandboxId, { requestTimeoutMs: 30_000 });
    } catch (error) {
      if (!isSandboxNotFoundError(error)) throw error;
    }

    await markSandboxSessionStopped(sessionId);
    deleteTrackedSession(sessionId);
    return record
      ? toStoppedPublicSession({
          ...record,
          isStopped: true,
        })
      : stoppedSession(sessionId, sandboxId, [
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
    setPreviewError(session);
    session.sandbox = undefined;
    session.previewProcessId = undefined;
    appendLog(session, "Sandbox stopped.\n");
    await markSandboxSessionStopped(sessionId);
    deleteTrackedSession(sessionId);
  } catch (error) {
    if (isSandboxNotFoundError(error)) {
      session.status = "stopped";
      setPreviewError(session);
      appendLog(session, "Sandbox was already gone.\n");
      await markSandboxSessionStopped(sessionId);
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
  let session = getTrackedSession(sessionId);

  if (!session) {
    const restored = await restoreActiveSandboxSession(sessionId);

    if (!restored || restored.status === "stopped") {
      throw new Error("Session not found.");
    }

    session = getTrackedSession(sessionId);
  }

  if (!session?.sandbox) throw new Error("Session not found.");
  if (session.status === "stopped")
    throw new Error("Sandbox is already stopped.");

  const heartbeat = recordSessionHeartbeat(sessionId);
  if (heartbeat?.lastHeartbeatAt) {
    await touchSandboxSessionHeartbeat(
      heartbeat.sessionId,
      new Date(heartbeat.lastHeartbeatAt),
    );
  }

  appendLog(session, "\nManual preview restart requested.\n");
  session.restartingPreview = restartPreviewServer(session, "Restarting").finally(
    () => {
      session.restartingPreview = undefined;
    },
  );
  await session.restartingPreview;
  await verifySandboxHealth(session);
  await waitForPreview(session, {
    timeoutMs: RESTART_PREVIEW_TIMEOUT_MS,
  });

  return publicSession(session);
}

export async function checkSandboxPreview(sessionId: string) {
  let session = getTrackedSession(sessionId);

  if (!session) {
    const restored = await restoreActiveSandboxSession(sessionId);

    if (!restored || restored.status === "stopped") {
      throw new Error("Session not found.");
    }

    session = getTrackedSession(sessionId);
  }

  if (!session?.sandbox) throw new Error("Session not found.");
  if (session.status !== "running") throw new Error("Sandbox is not running.");

  const heartbeat = recordSessionHeartbeat(sessionId);
  if (heartbeat?.lastHeartbeatAt) {
    await touchSandboxSessionHeartbeat(
      heartbeat.sessionId,
      new Date(heartbeat.lastHeartbeatAt),
    );
  }

  return checkPreviewContentForDiagnostics(session);
}

export const lifecycleProviderMethods: Pick<
  SandboxProvider,
  "checkPreview" | "get" | "heartbeat" | "restartPreview" | "start" | "stop"
> = {
  checkPreview: checkSandboxPreview,
  get: getSandboxSession,
  heartbeat: heartbeatSandboxSession,
  restartPreview: restartSandboxPreview,
  start: createSandboxSession,
  stop: stopSandboxSession,
};
