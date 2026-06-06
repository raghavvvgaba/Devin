export const PROJECT_DIR = "/home/user/repo";
export const PREVIEW_PORT = 5173;
export const PREVIEW_VERSION_PATH = "__preview_version.txt";
export const SANDBOX_TIMEOUT_MS = 30 * 60_000;
export const SANDBOX_METADATA_APP = "devin-e2b-preview";
export const STARTUP_PREVIEW_TIMEOUT_MS = 75_000;
export const RESTART_PREVIEW_TIMEOUT_MS = 15_000;
export const RESTORE_PREVIEW_TIMEOUT_MS = 10_000;
export const EDIT_PREVIEW_TIMEOUT_MS = 8_000;
export const PREVIEW_RETRY_DELAY_MS = 1000;
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const ABANDONMENT_GRACE_MS = 10 * 60_000;
export const DEFAULT_SANDBOX_READ_LINE_COUNT = 120;
export const DEFAULT_SANDBOX_READ_MAX_CHARACTERS = 10_000;

export const UNSUPPORTED_REPO_MESSAGE =
  "This repository type is not supported yet. Supported: static HTML/CSS/JS and Vite React.";
export const UNSUPPORTED_PACKAGE_MANAGER_MESSAGE =
  "This package manager is not supported yet. Supported: bun, npm, pnpm, and yarn.";
export const UNSUPPORTED_FULL_STACK_REPO_MESSAGE =
  "This looks like a frontend/backend repository. Multi-process full-stack sandboxes are not supported yet. Supported right now: root static HTML/CSS/JS and root Vite React.";
export const UNSUPPORTED_NESTED_APP_REPO_MESSAGE =
  "This repository appears to keep its app in a nested folder. Nested apps are not supported yet. Supported right now: root static HTML/CSS/JS and root Vite React.";
export const UNSUPPORTED_WORKSPACE_REPO_MESSAGE =
  "This looks like a workspace or monorepo. Workspace/monorepo sandboxes are not supported yet. Supported right now: root static HTML/CSS/JS and root Vite React.";
