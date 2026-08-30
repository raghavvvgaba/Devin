import {
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";
import type { CommandHandle } from "e2b";

import {
  EDIT_PREVIEW_TIMEOUT_MS,
  PREVIEW_PORT,
  PREVIEW_RETRY_DELAY_MS,
  RESTART_PREVIEW_TIMEOUT_MS,
  STARTUP_PREVIEW_TIMEOUT_MS,
} from "~/server/sandbox/providers/e2b/constants";
import { verifySandboxHealth } from "~/server/sandbox/providers/e2b/sandbox-ops";
import {
  appendLog,
  describeSessionError,
  publicSession,
  setPreviewError,
  setPreviewState,
} from "~/server/sandbox/providers/e2b/session-state";
import type { E2BSandboxSession } from "~/server/sandbox/providers/e2b/types";

const previewTracer = trace.getTracer("inlaya.sandbox-preview");
const EDIT_PREVIEW_URL_CHECK_TIMEOUT_MS = 2_000;
const EDIT_PREVIEW_URL_RETRY_DELAY_MS = 500;

async function tracePreviewStage<T>(
  name: string,
  execute: (span: Span) => Promise<T>,
  attributes: Attributes = {},
): Promise<T> {
  return previewTracer.startActiveSpan(
    name,
    {
      attributes,
      kind: SpanKind.INTERNAL,
    },
    async (span) => {
      try {
        const result = await execute(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        const exception = error instanceof Error ? error : new Error(String(error));
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

const VITE_REACT_ERROR_MARKERS = [
  "vite-error-overlay",
  "plugin:vite",
  "[vite] Internal server error",
  "Failed to resolve import",
  "React is not defined",
  "ReferenceError:",
  "TypeError:",
] as const;

export type VitePreviewContentCheckResult =
  | { ok: true }
  | {
      details: string;
      marker?: string;
      ok: false;
      reason:
        | "blank_preview"
        | "browser_check_failed"
        | "empty_preview"
        | "fetch_failed"
        | "runtime_error_marker";
    };

export async function waitForPreview(
  session: E2BSandboxSession,
  options: { timeoutMs?: number; retryDelayMs?: number; offlineMessage?: string } = {},
) {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? STARTUP_PREVIEW_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? PREVIEW_RETRY_DELAY_MS;

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

      setPreviewState(session, "ready", "Preview ready.");
      return true;
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
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
  return tracePreviewStage(
    "preview restart",
    async (span) => {
      setPreviewState(session, "recovering", "Preview reconnecting.");
      const stopped = await tracePreviewStage(
        "preview process_stop",
        async (stopSpan) => {
          const result = await stopPreviewProcess(session);
          stopSpan.setAttribute("preview.process.stopped", result);
          return result;
        },
      );
      await tracePreviewStage(
        "preview process_start",
        async () => startPreviewServer(session, reason),
      );
      span.setAttribute("preview.process.stopped_before_start", stopped);
    },
    {
      "preview.restart.reason": reason,
    },
  );
}

async function isPreviewProcessRunning(session: E2BSandboxSession) {
  if (!session.sandbox || !session.previewProcessId) return false;

  const processes = await session.sandbox.commands.list({ requestTimeoutMs: 10_000 });
  return processes.some((process) => process.pid === session.previewProcessId);
}

async function isE2BClosedPortResponse(response: Response) {
  if (
    response.status !== 502 ||
    !response.headers.get("content-type")?.includes("application/json")
  ) {
    return false;
  }

  try {
    const body = (await response.json()) as unknown;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return false;
    }

    const error = body as Record<string, unknown>;
    return (
      error.code === 502 &&
      error.port === PREVIEW_PORT &&
      typeof error.message === "string" &&
      error.message.toLowerCase().includes("port is not open")
    );
  } catch {
    return false;
  }
}

async function isPreviewUrlReachable(
  session: E2BSandboxSession,
  timeoutMs = 4_000,
) {
  try {
    const response = await fetch(session.previewUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });

    return !(await isE2BClosedPortResponse(response));
  } catch {
    return false;
  }
}

function getHtmlBody(html: string) {
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return bodyMatch?.[1] ?? html;
}

export function checkViteReactPreviewHtml(html: string): VitePreviewContentCheckResult {
  const trimmedHtml = html.trim();
  const normalizedHtml = trimmedHtml.replace(/\s+/g, " ");

  if (trimmedHtml.length < 80) {
    return {
      details: "Preview response was empty or too small to be a Vite React page.",
      ok: false,
      reason: "empty_preview",
    };
  }

  const matchedMarker = VITE_REACT_ERROR_MARKERS.find((marker) =>
    normalizedHtml.includes(marker),
  );

  if (matchedMarker) {
    return {
      details: `Vite React preview response contained "${matchedMarker}".`,
      marker: matchedMarker,
      ok: false,
      reason: "runtime_error_marker",
    };
  }

  const body = getHtmlBody(trimmedHtml);
  const hasReactMount = /\bid=["']root["']/.test(body);
  const hasModuleScript = /<script\b[^>]*\btype=["']module["']/i.test(body);

  if (!hasReactMount && !hasModuleScript && body.trim().length < 80) {
    return {
      details: "Preview body was empty or missing the Vite React mount point.",
      ok: false,
      reason: "empty_preview",
    };
  }

  return { ok: true };
}

export async function checkViteReactPreviewContent(
  session: E2BSandboxSession,
): Promise<VitePreviewContentCheckResult> {
  try {
    const response = await fetch(session.previewUrl, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        details: `Preview returned HTTP ${response.status}.`,
        ok: false,
        reason: "fetch_failed",
      };
    }

    return checkViteReactPreviewHtml(await response.text());
  } catch (error) {
    return {
      details: error instanceof Error ? error.message : "Unable to fetch preview HTML.",
      ok: false,
      reason: "fetch_failed",
    };
  }
}

async function applyViteReactPreviewContentCheck(session: E2BSandboxSession) {
  const result = await tracePreviewStage(
    "preview content_fetch",
    async (span) => {
      const checkResult = await checkViteReactPreviewContent(session);
      span.setAttribute("preview.content.ok", checkResult.ok);
      if (!checkResult.ok) {
        span.setAttribute("preview.content.failure_reason", checkResult.reason);
      }
      return checkResult;
    },
    {
      "preview.request.timeout_ms": 4_000,
    },
  );
  if (!result.ok) {
    appendLog(session, `Preview check failed: ${result.details}\n`);
    setPreviewError(session, result.details);
    return false;
  }

  const browserResult = await checkViteReactPreviewBrowser(session);
  if (browserResult.ok) {
    setPreviewError(session);
    return true;
  }

  if (browserResult.reason === "browser_check_failed") {
    appendLog(session, `Preview browser check skipped: ${browserResult.details}\n`);
    setPreviewError(session);
    return true;
  }

  appendLog(session, `Preview browser check failed: ${browserResult.details}\n`);
  setPreviewError(session, browserResult.details);
  return false;
}

export async function checkPreviewContentForDiagnostics(session: E2BSandboxSession) {
  appendLog(session, "\nManual preview error check requested.\n");
  await applyViteReactPreviewContentCheck(session);
  return publicSession(session);
}

export async function checkViteReactPreviewBrowser(
  session: E2BSandboxSession,
): Promise<VitePreviewContentCheckResult> {
  return tracePreviewStage("preview browser_check", async (browserSpan) => {
    try {
      const { chromium } = await tracePreviewStage(
        "preview browser_load",
        async () => import("playwright"),
      );
      const browser = await tracePreviewStage(
        "preview browser_launch",
        async () => chromium.launch({ headless: true }),
      );

      try {
        const page = await tracePreviewStage(
          "preview browser_new_page",
          async () => browser.newPage(),
        );
        const observedErrors: string[] = [];

        page.on("console", (message) => {
          if (message.type() === "error") {
            observedErrors.push(message.text());
          }
        });
        page.on("pageerror", (error) => {
          observedErrors.push(error.message);
        });

        await tracePreviewStage(
          "preview browser_navigate",
          async () =>
            page.goto(session.previewUrl, {
              timeout: 8_000,
              waitUntil: "domcontentloaded",
            }),
          {
            "preview.navigation.timeout_ms": 8_000,
            "preview.navigation.wait_until": "domcontentloaded",
          },
        );
        await tracePreviewStage(
          "preview browser_render_wait",
          async () => page.waitForTimeout(1_500),
          {
            "preview.render_wait_ms": 1_500,
          },
        );

        const rootState = await tracePreviewStage(
          "preview browser_inspect",
          async () =>
            page.evaluate(() => {
              const root = document.querySelector("#root");
              const bodyText = document.body.innerText.trim();

              return {
                bodyTextLength: bodyText.length,
                hasRoot: Boolean(root),
                rootChildCount: root?.childElementCount ?? 0,
                rootTextLength: root?.textContent?.trim().length ?? 0,
              };
            }),
        );

        browserSpan.setAttribute("preview.browser.error_count", observedErrors.length);

        if (observedErrors.length > 0) {
          browserSpan.setAttributes({
            "preview.browser.failure_reason": "runtime_error_marker",
            "preview.browser.ok": false,
          });
          return {
            details: observedErrors[0] ?? "Browser console error.",
            ok: false,
            reason: "runtime_error_marker",
          };
        }

        if (
          rootState.hasRoot &&
          rootState.rootChildCount === 0 &&
          rootState.rootTextLength === 0 &&
          rootState.bodyTextLength === 0
        ) {
          browserSpan.setAttributes({
            "preview.browser.failure_reason": "blank_preview",
            "preview.browser.ok": false,
          });
          return {
            details: "Vite React root stayed empty after browser render.",
            ok: false,
            reason: "blank_preview",
          };
        }

        browserSpan.setAttribute("preview.browser.ok", true);
        return { ok: true };
      } finally {
        await tracePreviewStage(
          "preview browser_close",
          async () => browser.close(),
        );
      }
    } catch (error) {
      browserSpan.setAttributes({
        "preview.browser.failure_reason": "browser_check_failed",
        "preview.browser.ok": false,
      });
      return {
        details: error instanceof Error ? error.message : "Unable to run browser check.",
        ok: false,
        reason: "browser_check_failed",
      };
    }
  });
}

export async function syncPreviewHealth(session: E2BSandboxSession) {
  const urlReachable = await isPreviewUrlReachable(session);

  if (urlReachable) {
    setPreviewState(session, "ready", "Preview ready.");
    return true;
  }

  const processRunning = await isPreviewProcessRunning(session);
  setPreviewState(
    session,
    processRunning ? "recovering" : "offline",
    processRunning ? "Preview reconnecting." : "Preview unavailable.",
  );
  return false;
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
      const recovered = await waitForPreview(session, {
        timeoutMs: RESTART_PREVIEW_TIMEOUT_MS,
      });
      if (recovered) {
        appendLog(session, "Preview server recovered.\n");
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
  return tracePreviewStage("preview recover_after_edit", async (recoverySpan) => {
    let urlReachableAfterWrite = await tracePreviewStage(
      "preview url_check",
      async (span) => {
        const reachable = await isPreviewUrlReachable(
          session,
          EDIT_PREVIEW_URL_CHECK_TIMEOUT_MS,
        );
        span.setAttribute("preview.url.reachable", reachable);
        return reachable;
      },
      {
        "preview.request.attempt": 1,
        "preview.request.timeout_ms": EDIT_PREVIEW_URL_CHECK_TIMEOUT_MS,
      },
    );

    let processAliveAfterWrite: boolean | undefined;
    if (!urlReachableAfterWrite) {
      processAliveAfterWrite = await tracePreviewStage(
        "preview process_check",
        async (span) => {
          const running = await isPreviewProcessRunning(session);
          span.setAttribute("preview.process.running", running);
          return running;
        },
        {
          "preview.request.timeout_ms": 10_000,
        },
      );
      appendLog(
        session,
        `Preview process after write: ${processAliveAfterWrite ? "running" : "stopped"}\n`,
      );

      if (processAliveAfterWrite) {
        await tracePreviewStage(
          "preview url_retry_delay",
          async () =>
            new Promise((resolve) =>
              setTimeout(resolve, EDIT_PREVIEW_URL_RETRY_DELAY_MS),
            ),
          {
            "preview.retry_delay_ms": EDIT_PREVIEW_URL_RETRY_DELAY_MS,
          },
        );
        urlReachableAfterWrite = await tracePreviewStage(
          "preview url_check",
          async (span) => {
            const reachable = await isPreviewUrlReachable(
              session,
              EDIT_PREVIEW_URL_CHECK_TIMEOUT_MS,
            );
            span.setAttribute("preview.url.reachable", reachable);
            return reachable;
          },
          {
            "preview.request.attempt": 2,
            "preview.request.timeout_ms": EDIT_PREVIEW_URL_CHECK_TIMEOUT_MS,
          },
        );
      }
    } else {
      appendLog(session, "Preview process after write: not checked; URL is reachable.\n");
    }

    appendLog(
      session,
      `Preview URL after write: ${urlReachableAfterWrite ? "reachable" : "unreachable"}\n`,
    );

    recoverySpan.setAttributes({
      "preview.process.status":
        processAliveAfterWrite === undefined
          ? "not_checked"
          : processAliveAfterWrite
            ? "running"
            : "stopped",
      "preview.url.reachable": urlReachableAfterWrite,
    });

    if (!urlReachableAfterWrite) {
      appendLog(session, "Edit detected preview failure. Attempting one automatic restart...\n");

      try {
        await restartPreviewServer(session, "Restarting");
        const recovered = await tracePreviewStage(
          "preview readiness_wait",
          async (span) => {
            const ready = await waitForPreview(session, {
              timeoutMs: RESTART_PREVIEW_TIMEOUT_MS,
              offlineMessage: "Preview crashed after the change and did not recover.",
            });
            span.setAttributes({
              "preview.ready": ready,
              "preview.state": session.previewState,
            });
            return ready;
          },
          {
            "preview.wait.reason": "after_restart",
            "preview.wait.timeout_ms": RESTART_PREVIEW_TIMEOUT_MS,
          },
        );
        appendLog(
          session,
          `Automatic restart result: ${recovered ? "recovered" : "not recovered"}\n`,
        );
        recoverySpan.setAttributes({
          "preview.recovery.path": "restart",
          "preview.recovery.success": recovered,
        });
        return recovered;
      } catch (error) {
        appendLog(session, `Automatic restart failed: ${describeSessionError(session, error)}\n`);
        await tracePreviewStage(
          "preview sandbox_health_check",
          async () => verifySandboxHealth(session),
        );
        setPreviewState(
          session,
          "offline",
          "Preview crashed after the change. Restart the preview.",
        );
        recoverySpan.setAttributes({
          "preview.recovery.path": "restart",
          "preview.recovery.success": false,
        });
        return false;
      }
    }

    const fresh = await tracePreviewStage(
      "preview readiness_wait",
      async (span) => {
        const ready = await waitForPreview(session, {
          timeoutMs: EDIT_PREVIEW_TIMEOUT_MS,
          offlineMessage: "Preview unavailable after the change. Restart the preview.",
        });
        span.setAttributes({
          "preview.ready": ready,
          "preview.state": session.previewState,
        });
        return ready;
      },
      {
        "preview.wait.reason": "after_edit",
        "preview.wait.timeout_ms": EDIT_PREVIEW_TIMEOUT_MS,
      },
    );
    if (fresh) {
      const contentOk = await tracePreviewStage(
        "preview content_check",
        async (span) => {
          const ok = await applyViteReactPreviewContentCheck(session);
          span.setAttribute("preview.content.ok", ok);
          return ok;
        },
      );
      appendLog(
        session,
        `Preview content check: ${contentOk ? "passed" : session.previewState}\n`,
      );
      recoverySpan.setAttributes({
        "preview.recovery.path": "healthy",
        "preview.recovery.success": contentOk,
      });
      return contentOk;
    }

    appendLog(
      session,
      `Edit freshness result: ${session.previewState}\n`,
    );
    recoverySpan.setAttributes({
      "preview.recovery.path": "freshness_timeout",
      "preview.recovery.success": false,
    });
    return false;
  });
}
