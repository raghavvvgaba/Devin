import type { CommandHandle } from "e2b";

import {
  EDIT_PREVIEW_TIMEOUT_MS,
  PREVIEW_PORT,
  PREVIEW_RETRY_DELAY_MS,
  PREVIEW_VERSION_PATH,
  RESTART_PREVIEW_TIMEOUT_MS,
  STARTUP_PREVIEW_TIMEOUT_MS,
} from "~/server/sandbox/providers/e2b/constants";
import { verifySandboxHealth } from "~/server/sandbox/providers/e2b/sandbox-ops";
import {
  appendLog,
  describeSessionError,
  setPreviewState,
} from "~/server/sandbox/providers/e2b/session-state";
import type { E2BSandboxSession } from "~/server/sandbox/providers/e2b/types";

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

export async function waitForPreview(
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
    setPreviewState(
      session,
      "stale",
      "Change saved. Refresh the preview tab if it still looks old.",
    );
    appendLog(
      session,
      `\nPreview is reachable but still serving ${lastObservedVersion} instead of ${expectedVersion}. Refresh may be needed.\n`,
    );
    return false;
  }

  setPreviewState(
    session,
    "offline",
    options.offlineMessage ?? "Preview unavailable. Restart the preview.",
  );
  appendLog(
    session,
    "\nPreview did not respond before the readiness timeout. The URL may still become available.\n",
  );
  return false;
}

export async function stopPreviewProcess(session: E2BSandboxSession) {
  if (!session.sandbox || !session.previewProcessId) return false;

  try {
    const killed = await session.sandbox.commands.kill(session.previewProcessId, {
      requestTimeoutMs: 10_000,
    });
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

export async function startPreviewServer(
  session: E2BSandboxSession,
  reason = "Starting",
) {
  if (!session.sandbox) throw new Error("Sandbox is not ready.");
  if (!session.previewCommand || !session.previewCwd) {
    throw new Error("Preview command is not configured for this sandbox.");
  }

  appendLog(session, `\n${reason} preview server on port ${PREVIEW_PORT}...\n`);
  appendLog(session, `$ ${session.previewCommand}\n`);

  const command = (await session.sandbox.commands.run(session.previewCommand, {
    cwd: session.previewCwd,
    background: true,
    onStdout: (data: string) => appendLog(session, data),
    onStderr: (data: string) => appendLog(session, data),
  })) as CommandHandle;

  session.previewProcessId = command.pid;
  appendLog(session, `Preview process started with pid ${command.pid}\n`);
}

export async function restartPreviewServer(
  session: E2BSandboxSession,
  reason = "Restarting",
) {
  setPreviewState(session, "recovering", "Preview reconnecting.");
  await stopPreviewProcess(session);
  await startPreviewServer(session, reason);
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
    setPreviewState(
      session,
      "stale",
      "Change saved. Refresh the preview tab if it still looks old.",
    );
    return true;
  }

  setPreviewState(session, "ready", "Preview ready.");
  return true;
}

export async function ensurePreviewServer(session: E2BSandboxSession) {
  if (!session.sandbox || session.status !== "running") return;
  if (session.restartingPreview) {
    await session.restartingPreview;
    return;
  }

  const healthy = await syncPreviewHealth(session);
  if (healthy) return;

  const restart = async () => {
    appendLog(
      session,
      `\nPreview health check failed. Restarting preview server on port ${PREVIEW_PORT}...\n`,
    );

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
      appendLog(session, `Preview restart failed: ${describeSessionError(session, error)}\n`);
      throw error;
    }
  };

  session.restartingPreview = restart().finally(() => {
    session.restartingPreview = undefined;
  });

  await session.restartingPreview;
}

export async function recoverPreviewAfterEdit(session: E2BSandboxSession) {
  const processAliveAfterWrite = await isPreviewProcessRunning(session);
  appendLog(
    session,
    `Preview process after write: ${processAliveAfterWrite ? "running" : "stopped"}\n`,
  );

  const urlReachableAfterWrite = processAliveAfterWrite
    ? await isPreviewUrlReachable(session)
    : false;
  appendLog(
    session,
    `Preview URL after write: ${urlReachableAfterWrite ? "reachable" : "unreachable"}\n`,
  );

  if (!processAliveAfterWrite || !urlReachableAfterWrite) {
    appendLog(session, "Edit detected preview failure. Attempting one automatic restart...\n");

    try {
      await restartPreviewServer(session, "Restarting");
      const recovered = await waitForPreview(session, session.previewVersion, {
        timeoutMs: RESTART_PREVIEW_TIMEOUT_MS,
        offlineMessage: "Preview crashed after the change and did not recover.",
      });
      appendLog(
        session,
        `Automatic restart result: ${recovered ? "recovered" : "not recovered"}\n`,
      );
      return recovered;
    } catch (error) {
      appendLog(session, `Automatic restart failed: ${describeSessionError(session, error)}\n`);
      await verifySandboxHealth(session);
      setPreviewState(
        session,
        "offline",
        "Preview crashed after the change. Restart the preview.",
      );
      return false;
    }
  }

  const fresh = await waitForPreview(session, session.previewVersion, {
    timeoutMs: EDIT_PREVIEW_TIMEOUT_MS,
    offlineMessage: "Preview unavailable after the change. Restart the preview.",
  });
  appendLog(
    session,
    `Edit freshness result: ${fresh ? "matched latest version" : session.previewState}\n`,
  );
  return fresh;
}
