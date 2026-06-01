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

export type StartSandboxSessionInput = {
  repoName: string;
  repoOwner: string;
};

export type SandboxFileInput = {
  endLine?: number;
  path: string;
  sessionId: string;
  startLine?: number;
};

export type SandboxWriteFileInput = SandboxFileInput & {
  content: string;
};

export type SandboxListFilesInput = {
  path?: string;
  sessionId: string;
};

export type SandboxCommandInput = {
  command: string;
  sessionId: string;
};

export type SandboxDiffInput = {
  sessionId: string;
};

export type SandboxFile = {
  content: string;
  endLine: number;
  path: string;
  size: number;
  startLine: number;
  totalLines: number;
  truncated: boolean;
};

export type SandboxFileEntry = {
  path: string;
  name: string;
  type: "file" | "dir" | "unknown";
  size?: number;
};

export type SandboxCommandResult = {
  command: string;
  exitCode?: number;
  stderr: string;
  stdout: string;
};

export type SandboxProvider = {
  getDiff: (input: SandboxDiffInput) => Promise<string>;
  get: (sessionId: string) => SandboxSession | null;
  heartbeat: (sessionId: string) => SandboxSession | null;
  listFiles: (input: SandboxListFilesInput) => Promise<SandboxFileEntry[]>;
  readFile: (input: SandboxFileInput) => Promise<SandboxFile>;
  restartPreview: (sessionId: string) => Promise<SandboxSession>;
  runCommand: (input: SandboxCommandInput) => Promise<SandboxCommandResult>;
  start: (input: StartSandboxSessionInput) => Promise<SandboxSession>;
  stop: (input: StopSandboxSessionInput) => Promise<SandboxSession>;
  writeFile: (input: SandboxWriteFileInput) => Promise<{ path: string; session: SandboxSession }>;
};
