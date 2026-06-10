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
  projectId: string;
  repoName: string;
  repoOwner: string;
  userId: string;
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

export type SandboxSearchInput = {
  path?: string;
  query: string;
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

export type SandboxRawFileInput = {
  path: string;
  sessionId: string;
};

export type SandboxRawFile = {
  content: string;
  path: string;
  size: number;
};

export type SandboxRawWriteFileInput = {
  content: string;
  path: string;
  sessionId: string;
};

export type SandboxRawListFilesInput = {
  path?: string;
  sessionId: string;
};

export type SandboxFileEntry = {
  path: string;
  name: string;
  type: "file" | "dir" | "unknown";
  size?: number;
};

export type SandboxSearchMatch = {
  column: number;
  line: number;
  path: string;
  text: string;
};

export type SandboxSearchResult = {
  caps: {
    perFile: number;
    total: number;
  };
  matches: SandboxSearchMatch[];
  truncated: boolean;
};

export type SandboxCommandResult = {
  command: string;
  exitCode?: number;
  stderr: string;
  stdout: string;
};

export type SandboxProvider = {
  get: (sessionId: string) => Promise<SandboxSession | null>;
  heartbeat: (sessionId: string) => Promise<SandboxSession | null>;
  restartPreview: (sessionId: string) => Promise<SandboxSession>;
  runCommand: (input: SandboxCommandInput) => Promise<SandboxCommandResult>;
  runRawCommand: (input: SandboxCommandInput) => Promise<SandboxCommandResult>;
  listRawFiles: (input: SandboxRawListFilesInput) => Promise<SandboxFileEntry[]>;
  readRawFile: (input: SandboxRawFileInput) => Promise<SandboxRawFile>;
  start: (input: StartSandboxSessionInput) => Promise<SandboxSession>;
  stop: (input: StopSandboxSessionInput) => Promise<SandboxSession>;
  writeRawFile: (input: SandboxRawWriteFileInput) => Promise<{ path: string; session: SandboxSession }>;
};
