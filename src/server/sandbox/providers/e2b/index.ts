import "server-only";

import { getSandboxDiff, runSandboxCommand } from "~/server/sandbox/providers/e2b/command-ops";
import { readSandboxFile, listSandboxFiles, writeSandboxFile } from "~/server/sandbox/providers/e2b/file-ops";
import {
  cleanupSandboxSession,
  lifecycleProviderMethods,
  listSandboxSessions,
  restoreSandboxSession,
} from "~/server/sandbox/providers/e2b/lifecycle";
import {
  SandboxExpiredError,
  type SandboxListItem,
} from "~/server/sandbox/providers/e2b/session-state";
import type { SandboxProvider } from "~/server/sandbox/types";

export { cleanupSandboxSession, listSandboxSessions, restoreSandboxSession };
export { SandboxExpiredError };
export type { SandboxListItem };

export const e2bSandboxProvider: SandboxProvider = {
  ...lifecycleProviderMethods,
  getDiff: getSandboxDiff,
  listFiles: listSandboxFiles,
  readFile: readSandboxFile,
  runCommand: runSandboxCommand,
  writeFile: writeSandboxFile,
};
