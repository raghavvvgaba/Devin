import type { AIUsage } from "~/server/ai/types";

export type SandboxStatus = "starting" | "installing" | "running" | "stopped" | "error";
export type SandboxFailureCode = "startup_failed" | "unsupported_repository";
export type PreviewState = "ready" | "recovering" | "offline";
export type StartupStage = "creating" | "scaffolding" | "installing" | "seeding" | "starting-preview" | "ready" | "error";
export type SandboxSubmitState = "idle" | "running" | "completed" | "failed";
export type SandboxSubmitStage =
  | "checking-changes"
  | "preparing-branch"
  | "staging"
  | "committing"
  | "pushing"
  | "creating-pr"
  | "done"
  | "error";

export type SandboxSession = {
  sessionId: string;
  environmentId: string;
  previewUrl: string;
  status: SandboxStatus;
  logs: string[];
  failureCode?: SandboxFailureCode;
  failureMessage?: string;
  message?: string;
  startedAt?: string;
  endAt?: string;
  remainingMs?: number;
  previewState: PreviewState;
  previewError?: string;
  previewMessage?: string;
  startupStage?: StartupStage;
  startupMessage?: string;
  submitState?: SandboxSubmitState;
  submitStage?: SandboxSubmitStage;
  submitMessage?: string;
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
  include?: string[];
  path?: string;
  query: string;
  regex?: boolean;
  sessionId: string;
};

export type SandboxGlobInput = {
  path?: string;
  patterns: string[];
  sessionId: string;
};

export type SandboxGlobResult = {
  cap: number;
  paths: string[];
  truncated: boolean;
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

export type SandboxSubmitChangesInput = {
  branchName: string;
  commitMessage: string;
  installationToken: string;
  repoName: string;
  repoOwner: string;
  sessionId: string;
};

export type SandboxSubmitChangesResult =
  | {
      branchName: string;
      commitHash: string;
      status: "committed";
    }
  | {
      branchName: string;
      message: string;
      status: "noop";
    };

export type SandboxSubmitProgressInput = {
  message?: string;
  sessionId: string;
  stage?: SandboxSubmitStage;
  state: SandboxSubmitState;
};

export type SandboxAgentStatus =
  | "completed"
  | "blocked"
  | "failed";

export type SandboxAgentMode = "build" | "plan";

export type SandboxAgentConversationMessage = {
  content: string;
  role: "assistant" | "user";
};

export type SandboxAgentInput = {
  conversationHistory: SandboxAgentConversationMessage[];
  conversationSessionId: string;
  issueNumber: number;
  issueTitle: string;
  mode: SandboxAgentMode;
  model?: string;
  projectId: string;
  repoName: string;
  repoOwner: string;
  sessionId: string;
  userInstruction: string;
};

export type SandboxAgentResult = {
  clarificationQuestion?: string;
  filesTouched: string[];
  message: string;
  session?: SandboxSession;
  status: SandboxAgentStatus;
  stepsUsed: number;
  usage?: AIUsage;
};

export type SandboxProvider = {
  get: (sessionId: string) => Promise<SandboxSession | null>;
  heartbeat: (sessionId: string) => Promise<SandboxSession | null>;
  restartPreview: (sessionId: string) => Promise<SandboxSession>;
  runCommand: (input: SandboxCommandInput) => Promise<SandboxCommandResult>;
  runRawCommand: (input: SandboxCommandInput) => Promise<SandboxCommandResult>;
  setSubmitProgress: (input: SandboxSubmitProgressInput) => Promise<SandboxSession>;
  submitChanges: (input: SandboxSubmitChangesInput) => Promise<SandboxSubmitChangesResult>;
  listRawFiles: (input: SandboxRawListFilesInput) => Promise<SandboxFileEntry[]>;
  readRawFile: (input: SandboxRawFileInput) => Promise<SandboxRawFile>;
  start: (input: StartSandboxSessionInput) => Promise<SandboxSession>;
  stop: (input: StopSandboxSessionInput) => Promise<SandboxSession>;
  checkPreview: (sessionId: string) => Promise<SandboxSession>;
  writeRawFile: (input: SandboxRawWriteFileInput) => Promise<{ path: string; session: SandboxSession }>;
};
