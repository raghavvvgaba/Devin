import "server-only";

/** Implements the app-owned git_diff sandbox tool. */

import { sandboxProvider } from "~/server/sandbox/provider";
import type { SandboxDiffInput } from "~/server/sandbox/types";

export const SANDBOX_DIFF_COMMAND = "git diff -- .";

export async function getSandboxDiff(input: SandboxDiffInput) {
  const result = await sandboxProvider.runCommand({
    command: SANDBOX_DIFF_COMMAND,
    sessionId: input.sessionId,
  });

  return result.stdout;
}
