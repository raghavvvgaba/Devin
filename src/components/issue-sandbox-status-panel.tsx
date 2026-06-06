"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  Play,
  RefreshCw,
  Square,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type SandboxStatus = "starting" | "installing" | "running" | "stopped" | "error";
type PreviewState = "ready" | "recovering" | "stale" | "offline";
type StartupStage =
  | "creating"
  | "scaffolding"
  | "installing"
  | "seeding"
  | "starting-preview"
  | "ready"
  | "error";

type SandboxSession = {
  endAt?: string;
  environmentId: string;
  logs: string[];
  message?: string;
  previewMessage?: string;
  previewState: PreviewState;
  previewUrl: string;
  remainingMs?: number;
  sessionId: string;
  startedAt?: string;
  startupMessage?: string;
  startupStage?: StartupStage;
  status: SandboxStatus;
};

type SandboxResponse =
  | {
      ok: true;
      session: SandboxSession;
    }
  | {
      error: string;
      ok: false;
    };

type SavedSandboxSession = {
  environmentId: string;
  sessionId: string;
};

type IssueSandboxStatusPanelProps = {
  heartbeatAction: string;
  projectId: string;
  restartPreviewAction: string;
  sessionAction: string;
  startAction: string;
  stopAction: string;
};

const ACTIVE_STATUSES = new Set<SandboxStatus>([
  "starting",
  "installing",
  "running",
]);
const POLL_INTERVAL_MS = 2500;
const HEARTBEAT_INTERVAL_MS = 30_000;

const statusCopy: Record<SandboxStatus, string> = {
  starting: "Starting",
  installing: "Installing",
  running: "Running",
  stopped: "Stopped",
  error: "Error",
};

const statusStyles: Record<SandboxStatus, string> = {
  starting: "border-cyan-500/30 bg-cyan-500/10 text-cyan-100",
  installing: "border-blue-500/30 bg-blue-500/10 text-blue-100",
  running: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  stopped: "border-white/10 bg-white/[0.04] text-white/60",
  error: "border-red-500/30 bg-red-500/10 text-red-100",
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Sandbox request failed.";
}

async function readSandboxResponse(response: Response) {
  const bodyText = await response.text();
  let result: SandboxResponse | null = null;

  try {
    result = bodyText ? (JSON.parse(bodyText) as SandboxResponse) : null;
  } catch {
    const contentType = response.headers.get("content-type") ?? "unknown";
    const preview = bodyText.trim().replace(/\s+/g, " ").slice(0, 240);

    throw new Error(
      `Sandbox returned ${response.status} ${response.statusText || "response"} instead of JSON (${contentType}). ${
        preview ? `Response: ${preview}` : "The response body was empty."
      }`,
    );
  }

  if (!result) {
    throw new Error(
      `Sandbox returned ${response.status} ${response.statusText || "response"} with an empty response body.`,
    );
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.ok ? "Sandbox request failed." : result.error);
  }

  return result.session;
}

export function IssueSandboxStatusPanel({
  heartbeatAction,
  projectId,
  restartPreviewAction,
  sessionAction,
  startAction,
  stopAction,
}: IssueSandboxStatusPanelProps) {
  const storageKey = useMemo(() => `devin:sandbox:${projectId}`, [projectId]);
  const [session, setSession] = useState<SandboxSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const isActive = session ? ACTIVE_STATUSES.has(session.status) : false;
  const canStart = !session || session.status === "stopped" || session.status === "error";
  const canOpenPreview =
    session?.status === "running" && session.previewState === "ready";
  const status = session?.status ?? "stopped";
  const statusMessage =
    session?.status === "stopped" || session?.status === "error"
      ? session.message ?? session.startupMessage
      : session?.startupMessage ?? session?.previewMessage ?? session?.message;
  const displayMessage =
    statusMessage ?? "Start a preview environment for this issue.";

  const saveSession = useCallback(
    (nextSession: SandboxSession) => {
      setSession(nextSession);

      if (nextSession.status === "stopped") {
        window.localStorage.removeItem(storageKey);
        return;
      }

      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          environmentId: nextSession.environmentId,
          sessionId: nextSession.sessionId,
        } satisfies SavedSandboxSession),
      );
    },
    [storageKey],
  );

  const clearSavedSession = useCallback(() => {
    window.localStorage.removeItem(storageKey);
  }, [storageKey]);

  const refreshSession = useCallback(
    async (sessionId: string) => {
      const url = new URL(sessionAction, window.location.origin);
      url.searchParams.set("sessionId", sessionId);
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });
      const nextSession = await readSandboxResponse(response);
      saveSession(nextSession);
      return nextSession;
    },
    [saveSession, sessionAction],
  );

  useEffect(() => {
    const savedValue = window.localStorage.getItem(storageKey);
    if (!savedValue) return;

    try {
      const saved = JSON.parse(savedValue) as Partial<SavedSandboxSession>;
      if (!saved.sessionId) {
        clearSavedSession();
        return;
      }

      void refreshSession(saved.sessionId).catch(() => {
        clearSavedSession();
      });
    } catch {
      clearSavedSession();
    }
  }, [clearSavedSession, refreshSession, storageKey]);

  useEffect(() => {
    if (!session || session.status === "running" || session.status === "stopped" || session.status === "error") {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshSession(session.sessionId).catch((refreshError) => {
        setError(getErrorMessage(refreshError));
      });
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshSession, session]);

  useEffect(() => {
    if (!session || !isActive) return;

    const heartbeat = async () => {
      const response = await fetch(heartbeatAction, {
        body: JSON.stringify({ sessionId: session.sessionId }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const nextSession = await readSandboxResponse(response);
      saveSession(nextSession);
    };

    const interval = window.setInterval(() => {
      void heartbeat().catch((heartbeatError) => {
        setError(getErrorMessage(heartbeatError));
      });
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [heartbeatAction, isActive, saveSession, session]);

  async function handleStart() {
    if (isStarting) return;

    setError(null);
    setIsStarting(true);

    try {
      const response = await fetch(startAction, {
        headers: {
          Accept: "application/json",
        },
        method: "POST",
      });
      const nextSession = await readSandboxResponse(response);
      saveSession(nextSession);
    } catch (startError) {
      setError(getErrorMessage(startError));
    } finally {
      setIsStarting(false);
    }
  }

  async function handleRestartPreview() {
    if (!session || isRestarting) return;

    setError(null);
    setIsRestarting(true);

    try {
      const response = await fetch(restartPreviewAction, {
        body: JSON.stringify({ sessionId: session.sessionId }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const nextSession = await readSandboxResponse(response);
      saveSession(nextSession);
    } catch (restartError) {
      setError(getErrorMessage(restartError));
    } finally {
      setIsRestarting(false);
    }
  }

  async function handleStop() {
    if (!session || isStopping) return;

    setError(null);
    setIsStopping(true);

    try {
      const response = await fetch(stopAction, {
        body: JSON.stringify({
          environmentId: session.environmentId,
          sessionId: session.sessionId,
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const nextSession = await readSandboxResponse(response);
      saveSession(nextSession);
      clearSavedSession();
    } catch (stopError) {
      setError(getErrorMessage(stopError));
    } finally {
      setIsStopping(false);
    }
  }

  return (
      <section className="mb-4 overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/[0.32] shadow-[0_18px_60px_rgba(0,0,0,0.24)]">
        <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">
                Live Preview Environment
              </p>
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]",
                  statusStyles[status],
                )}
              >
                {statusCopy[status]}
              </span>
            </div>
            <p className="max-w-3xl whitespace-pre-line text-sm leading-6 text-white/68">
              {displayMessage}
            </p>
            {session?.previewUrl && canOpenPreview ? (
              <p className="truncate font-mono text-xs text-white/38">
                {session.previewUrl}
              </p>
            ) : null}
            {error ? (
              <p className="text-sm leading-6 text-red-200">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canStart ? (
              <Button
                className="rounded-full bg-white text-black hover:bg-white/85"
                disabled={isStarting}
                onClick={handleStart}
                type="button"
              >
                {isStarting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {isStarting ? "Starting" : "Start Sandbox"}
              </Button>
            ) : null}

            {session?.previewUrl && canOpenPreview ? (
              <Button
                asChild
                className="rounded-full bg-cyan-500 text-black hover:bg-cyan-400"
              >
                <a href={session.previewUrl} rel="noreferrer" target="_blank">
                  <ExternalLink className="h-4 w-4" />
                  Open Preview
                </a>
              </Button>
            ) : null}

            {session?.previewUrl && !canOpenPreview && session.status !== "stopped" ? (
              <Button
                className="rounded-full border-white/10 bg-transparent text-white/45"
                disabled
                type="button"
                variant="outline"
              >
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Preview starting
              </Button>
            ) : null}

            {session && session.status !== "stopped" ? (
              <>
                <Button
                  className="rounded-full border-white/10 bg-transparent text-white/75 hover:bg-white/10 hover:text-white"
                  disabled={isRestarting || isStopping}
                  onClick={handleRestartPreview}
                  type="button"
                  variant="outline"
                >
                  {isRestarting ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {isRestarting ? "Restarting" : "Restart"}
                </Button>
                <Button
                  className="rounded-full border-red-500/30 bg-transparent text-red-100 hover:bg-red-500/10"
                  disabled={isStopping || isRestarting}
                  onClick={handleStop}
                  type="button"
                  variant="outline"
                >
                  {isStopping ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                  {isStopping ? "Stopping" : "Stop"}
                </Button>
              </>
            ) : null}

            {session?.logs.length ? (
              <Button
                className="rounded-full border-white/10 bg-transparent text-white/55 hover:bg-white/10 hover:text-white"
                onClick={() => {
                  setShowDiagnostics((current) => !current);
                }}
                type="button"
                variant="outline"
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    showDiagnostics ? "rotate-180" : "",
                  )}
                />
                Diagnostics
              </Button>
            ) : null}
          </div>
        </div>

        {showDiagnostics && session?.logs.length ? (
          <div className="border-t border-white/10 bg-black/35 px-4 py-4 sm:px-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">
                Sandbox Logs
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
                {session.logs.length} lines
              </p>
            </div>
            <pre className="max-h-72 overflow-auto rounded-[1rem] border border-white/10 bg-black/55 p-3 font-mono text-xs leading-5 text-white/68">
              {session.logs.join("")}
            </pre>
          </div>
        ) : null}
      </section>
  );
}
