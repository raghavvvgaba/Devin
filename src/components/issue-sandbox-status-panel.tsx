"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bug,
  Copy,
  ExternalLink,
  LoaderCircle,
  Play,
  RefreshCw,
  Square,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { ModeToggle } from "~/components/mode-toggle";
import { sandboxSessionUpdatedEvent } from "~/lib/sandbox-events";
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
  failureCode?: "startup_failed" | "unsupported_repository";
  failureMessage?: string;
  logs: string[];
  message?: string;
  previewError?: string;
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
  checkPreviewAction: string;
  heartbeatAction: string;
  onPreviewStateChange?: (state: {
    isPreparing: boolean;
    message: string | null;
    previewUrl: string | null;
  }) => void;
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
  starting: "border-cyan-600/25 bg-cyan-600/10 text-cyan-700 dark:border-cyan-300/30 dark:bg-cyan-300/10 dark:text-cyan-200",
  installing: "border-blue-600/25 bg-blue-600/10 text-blue-700 dark:border-blue-300/30 dark:bg-blue-300/10 dark:text-blue-200",
  running: "border-emerald-600/25 bg-emerald-600/10 text-emerald-700 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-emerald-200",
  stopped: "border-[#171713]/20 bg-[#171713]/[0.035] text-[#6d675d] dark:border-white/15 dark:bg-white/[0.05] dark:text-[#aaa69d]",
  error: "border-red-600/25 bg-red-600/10 text-red-700 dark:border-red-300/30 dark:bg-red-300/10 dark:text-red-200",
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Sandbox request failed.";
}

function isSessionNotFoundError(error: unknown) {
  return error instanceof Error && error.message === "session_not_found";
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
  checkPreviewAction,
  heartbeatAction,
  onPreviewStateChange,
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
  const [isCheckingPreview, setIsCheckingPreview] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isUnsupportedRepoDialogOpen, setIsUnsupportedRepoDialogOpen] =
    useState(false);
  const isActive = session ? ACTIVE_STATUSES.has(session.status) : false;
  const canStart = !session || session.status === "stopped" || session.status === "error";
  const canOpenPreview =
    session?.status === "running" && Boolean(session.previewUrl);
  const status = session?.status ?? "stopped";
  const statusMessage =
    session?.status === "stopped" || session?.status === "error"
      ? session.message ?? session.startupMessage
      : session?.previewMessage ?? session?.startupMessage ?? session?.message;
  const displayMessage =
    statusMessage ?? "Start a preview environment for this issue.";

  // The host exists before dependencies and the preview server are ready. Keep
  // the embedded browser hidden during that first-time setup window.
  useEffect(() => {
    if (onPreviewStateChange) {
      onPreviewStateChange({
        isPreparing: Boolean(session && ACTIVE_STATUSES.has(session.status)),
        message: session ? displayMessage : null,
        previewUrl: canOpenPreview ? session?.previewUrl ?? null : null,
      });
    }
  }, [canOpenPreview, displayMessage, onPreviewStateChange, session]);

  useEffect(() => {
    if (
      session?.failureCode === "unsupported_repository" &&
      (session.status === "stopped" || session.status === "error")
    ) {
      setIsUnsupportedRepoDialogOpen(true);
    }
  }, [session?.failureCode, session?.sessionId, session?.status]);

  const saveSession = useCallback(
    (nextSession: SandboxSession) => {
      setSession(nextSession);

      if (
        nextSession.status === "stopped" ||
        nextSession.status === "error"
      ) {
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

  const loadCurrentProjectSession = useCallback(async () => {
    const response = await fetch(sessionAction, {
      headers: {
        Accept: "application/json",
      },
    });
    const nextSession = await readSandboxResponse(response);
    saveSession(nextSession);
    return nextSession;
  }, [saveSession, sessionAction]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapSession() {
      const savedValue = window.localStorage.getItem(storageKey);

      if (savedValue) {
        try {
          const saved = JSON.parse(savedValue) as Partial<SavedSandboxSession>;

          if (saved.sessionId) {
            try {
              await refreshSession(saved.sessionId);
              setError(null);
              return;
            } catch (refreshError) {
              if (!isSessionNotFoundError(refreshError)) {
                setError(getErrorMessage(refreshError));
              }
            }
          } else {
            clearSavedSession();
          }
        } catch {
          clearSavedSession();
        }
      }

      try {
        await loadCurrentProjectSession();
        setError(null);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        if (isSessionNotFoundError(loadError)) {
          setSession(null);
          setError(null);
          clearSavedSession();
          return;
        }

        clearSavedSession();
        setError(getErrorMessage(loadError));
      }
    }

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [
    clearSavedSession,
    loadCurrentProjectSession,
    refreshSession,
    storageKey,
  ]);

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

  useEffect(() => {
    function handleSandboxSessionUpdated(event: Event) {
      const customEvent = event as CustomEvent<{
        projectId?: string;
        sessionId?: string;
      }>;

      if (customEvent.detail?.projectId !== projectId) {
        return;
      }

      const sessionId = customEvent.detail.sessionId ?? session?.sessionId;
      if (!sessionId) {
        void loadCurrentProjectSession().catch((loadError) => {
          setError(getErrorMessage(loadError));
        });
        return;
      }

      void refreshSession(sessionId).catch((refreshError) => {
        setError(getErrorMessage(refreshError));
      });
    }

    window.addEventListener(sandboxSessionUpdatedEvent, handleSandboxSessionUpdated);
    return () => {
      window.removeEventListener(
        sandboxSessionUpdatedEvent,
        handleSandboxSessionUpdated,
      );
    };
  }, [loadCurrentProjectSession, projectId, refreshSession, session?.sessionId]);

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

  async function handleCheckPreview() {
    if (!session || isCheckingPreview) return;

    setError(null);
    setIsCheckingPreview(true);

    try {
      const response = await fetch(checkPreviewAction, {
        body: JSON.stringify({ sessionId: session.sessionId }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const nextSession = await readSandboxResponse(response);
      saveSession(nextSession);
    } catch (checkError) {
      setError(getErrorMessage(checkError));
    } finally {
      setIsCheckingPreview(false);
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

  async function handleCopyPreviewUrl() {
    if (!session?.previewUrl) return;

    try {
      await navigator.clipboard.writeText(session.previewUrl);
      toast.success("Preview URL copied.");
    } catch {
      toast.error("Preview URL could not be copied.");
    }
  }

  return (
    <>
      <div className="flex w-full items-center justify-between gap-4 text-[#171713] dark:text-[#fffaf0]">
      {/* Left side: Status and Real-time message */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={cn(
            "shrink-0 rounded-none border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em]",
            statusStyles[status],
          )}
        >
          {statusCopy[status]}
        </span>
        
        {/* Ticker / Current Message */}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-xs font-medium text-[#171713] dark:text-[#fffaf0]">
            {displayMessage}
          </p>
          {session?.previewUrl && canOpenPreview ? (
            <p className="truncate font-mono text-[10px] text-[#777167] dark:text-[#817e75]">
              {session.previewUrl}
            </p>
          ) : error ? (
            <p className="truncate text-[10px] text-destructive">
              {error}
            </p>
          ) : (session?.logs && session.logs.length > 0) ? (
            <p className="truncate font-mono text-[10px] text-[#777167] dark:text-[#817e75]">
              {session.logs[session.logs.length - 1]?.trim() || "Waiting for logs..."}
            </p>
          ) : null}
        </div>
      </div>

      {/* Right side: Controls */}
      <div className="flex shrink-0 items-center gap-2">
        {session?.status === "running" && session.previewError ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-8 rounded-none border-destructive/40 px-2 text-xs text-destructive"
                size="sm"
                type="button"
                variant="outline"
              >
                <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                Error
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-[360px] rounded-none border-border p-0"
            >
              <DropdownMenuLabel className="border-b border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest">
                Preview Error
              </DropdownMenuLabel>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-destructive">
                {session.previewError}
              </pre>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {canStart ? (
          <Button
            className="h-8 rounded-none bg-[#171713] text-xs font-semibold text-[#fffaf0] hover:bg-[#f04f2f] hover:text-white dark:bg-[#fffaf0] dark:text-[#171713]"
            disabled={isStarting}
            onClick={handleStart}
            size="sm"
            type="button"
          >
            {isStarting ? (
              <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isStarting ? "Starting" : "Start"}
          </Button>
        ) : null}

        {session?.previewUrl && canOpenPreview ? (
          <Button
            asChild
            size="sm"
            variant="secondary"
            className="h-8 rounded-none text-xs"
          >
            <a href={session.previewUrl} rel="noreferrer" target="_blank">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Preview
            </a>
          </Button>
        ) : null}

        {session && session.status === "running" ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-none text-xs"
            disabled={isCheckingPreview || isRestarting || isStopping}
            onClick={handleCheckPreview}
            type="button"
          >
            {isCheckingPreview ? (
              <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Bug className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isCheckingPreview ? "Checking" : "Check"}
          </Button>
        ) : null}

        {session && session.status === "running" ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Open sandbox diagnostics"
                className="h-8 rounded-none text-xs"
                disabled={session.logs.length === 0}
                size="sm"
                type="button"
                variant="outline"
              >
                <Terminal className="mr-1.5 h-3.5 w-3.5" />
                Diagnostics
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-[min(36rem,calc(100vw-2rem))] rounded-none border-border bg-zinc-950 p-0 text-zinc-100 shadow-2xl"
            >
              <DropdownMenuLabel className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
                <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
                  <span className="h-1.5 w-1.5 bg-emerald-400" />
                  Sandbox logs
                </span>
                <span className="font-mono text-[10px] font-normal text-zinc-500">
                  {session.logs.length} {session.logs.length === 1 ? "line" : "lines"}
                </span>
              </DropdownMenuLabel>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5 text-zinc-300">
                {session.logs.join("")}
              </pre>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {session?.previewUrl && session.status === "running" ? (
          <Button
            aria-label="Copy preview URL"
            className="h-8 w-8 rounded-none p-0"
            onClick={handleCopyPreviewUrl}
            size="icon"
            title="Copy preview URL"
            type="button"
            variant="outline"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        ) : null}

        {session?.previewUrl && !canOpenPreview && session.status !== "stopped" ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-none text-xs text-muted-foreground"
            disabled
            type="button"
          >
            <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            Wait
          </Button>
        ) : null}

        {session && session.status !== "stopped" ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-none text-xs"
              disabled={isRestarting || isStopping}
              onClick={handleRestartPreview}
              type="button"
            >
              {isRestarting ? (
                <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isRestarting ? "Restarting" : "Restart"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 rounded-none text-xs"
              disabled={isStopping || isRestarting}
              onClick={handleStop}
              type="button"
            >
              {isStopping ? (
                <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isStopping ? "Stopping" : "Stop"}
            </Button>
          </>
        ) : null}
        <div className="border-l border-[#171713]/10 pl-2 dark:border-white/10 [&_button]:text-[#6d675d] dark:[&_button]:text-[#aaa69d] [&_button:hover]:bg-[#171713]/5 dark:[&_button:hover]:bg-white/5 [&_button:hover]:text-[#171713] dark:[&_button:hover]:text-[#fffaf0]">
          <ModeToggle />
        </div>
      </div>
      </div>

      <Dialog
        open={isUnsupportedRepoDialogOpen}
        onOpenChange={setIsUnsupportedRepoDialogOpen}
      >
        <DialogContent
          className="gap-0 rounded-none border-destructive/30 bg-[#f3efe5] p-0 sm:max-w-lg dark:bg-[#171713]"
          showCloseButton={false}
        >
          <DialogHeader className="border-b border-[#171713]/10 p-6 dark:border-white/10">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center border border-destructive/30 bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-destructive">
                Repository compatibility
              </span>
            </div>
            <DialogTitle className="text-xl font-bold uppercase tracking-tight">
              This repository is not supported yet
            </DialogTitle>
            <DialogDescription className="pt-2 leading-relaxed">
              This repository does not match a structure Inlaya can run yet. The
              temporary sandbox was cleaned up automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#777167] dark:text-[#aaa69d]">
              Detection result
            </p>
            <p className="whitespace-pre-wrap border-l-2 border-destructive bg-destructive/[0.06] px-4 py-3 text-sm leading-relaxed text-[#171713] dark:text-[#fffaf0]">
              {session?.failureMessage ??
                "This repository does not match a supported application structure."}
            </p>
          </div>

          <DialogFooter className="border-t border-[#171713]/10 p-4 dark:border-white/10">
            <DialogClose asChild>
              <Button className="rounded-none" type="button" variant="outline">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
