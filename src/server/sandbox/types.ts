export type SandboxStatus = "starting" | "installing" | "running" | "stopped" | "error";
export type PreviewState = "ready" | "recovering" | "stale" | "offline";
export type StartupStage = "creating" | "scaffolding" | "installing" | "seeding" | "starting-preview" | "ready" | "error";

export type SandboxSession = {
  sessionId: string;
  environmentId: string;
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
};

export type StopSandboxSessionInput = {
  environmentId?: string;
  sessionId: string;
};

export type SandboxProvider = {
  get: (sessionId: string) => SandboxSession | null;
  heartbeat: (sessionId: string) => SandboxSession | null;
  restartPreview: (sessionId: string) => Promise<SandboxSession>;
  start: () => Promise<SandboxSession>;
  stop: (input: StopSandboxSessionInput) => Promise<SandboxSession>;
};
