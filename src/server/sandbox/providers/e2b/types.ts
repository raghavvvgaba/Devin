import type { Sandbox as E2BSandbox } from "e2b";

import type {
  PreviewState,
  SandboxCommandInput,
  SandboxDiffInput,
  SandboxFileInput,
  SandboxFailureCode,
  SandboxListFilesInput,
  SandboxStatus,
  SandboxWriteFileInput,
  StartSandboxSessionInput,
  StartupStage,
  SandboxSubmitStage,
  SandboxSubmitState,
} from "~/server/sandbox/types";

export type SandboxCtor = typeof import("e2b").Sandbox;

export type PackageManager = "bun" | "npm" | "pnpm" | "yarn";

export type SupportedRepoKind = "nextjs" | "static" | "vite-react";

export type RepoPreviewConfig = {
  installCommand?: string;
  kind: SupportedRepoKind;
  prepareCommand?: string;
  previewCommand: string;
  previewCwd: string;
};

export type RunStepInput = {
  command: string;
  cwd?: string;
  displayCommand?: string;
  timeoutMs: number;
};

export type RestoreSessionInput = {
  sessionId: string;
  sandboxId: string;
};

export type E2BSandboxSession = {
  sessionId: string;
  sandboxId: string;
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
  previewVersion?: string;
  previewObservedVersion?: string;
  startupStage?: StartupStage;
  startupMessage?: string;
  submitState?: SandboxSubmitState;
  submitStage?: SandboxSubmitStage;
  submitMessage?: string;
  previewCommand?: string;
  previewCwd?: string;
  repoKind?: SupportedRepoKind;
  sensitiveLogValues?: string[];
  sandbox?: E2BSandbox;
  previewProcessId?: number;
  restartingPreview?: Promise<void>;
  startupTask?: Promise<void>;
  cancelRequested?: boolean;
  lastHeartbeatAt?: string;
  abandonedAt?: string;
  abandonmentCleanupTask?: ReturnType<typeof setTimeout>;
};

export type ToolSessionInput =
  | SandboxCommandInput
  | SandboxDiffInput
  | SandboxFileInput
  | SandboxListFilesInput
  | SandboxWriteFileInput;

export type StartSessionInput = StartSandboxSessionInput;
