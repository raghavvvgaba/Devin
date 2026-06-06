import { PROJECT_DIR } from "~/server/sandbox/providers/e2b/constants";
import {
  appendLog,
  getRunningToolSession,
} from "~/server/sandbox/providers/e2b/session-state";
import { SANDBOX_DIFF_COMMAND } from "~/server/sandbox/tools/diff";
import { normalizeSandboxCommand } from "~/server/sandbox/tools/commands";
import type {
  SandboxCommandInput,
  SandboxCommandResult,
  SandboxDiffInput,
} from "~/server/sandbox/types";

export async function runSandboxCommand(
  input: SandboxCommandInput,
): Promise<SandboxCommandResult> {
  const session = getRunningToolSession(input.sessionId);
  const command = normalizeSandboxCommand(input.command);

  appendLog(session, `\n$ ${command}\n`);

  try {
    const result = await session.sandbox!.commands.run(command, {
      cwd: PROJECT_DIR,
      timeoutMs: 30_000,
      onStdout: (data: string) => appendLog(session, data),
      onStderr: (data: string) => appendLog(session, data),
    });

    return {
      command,
      exitCode: result.exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
    };
  } catch (error) {
    const stdout =
      error instanceof Error &&
      "stdout" in error &&
      typeof error.stdout === "string"
        ? error.stdout
        : "";
    const stderr =
      error instanceof Error &&
      "stderr" in error &&
      typeof error.stderr === "string"
        ? error.stderr
        : "";
    const exitCode =
      error instanceof Error &&
      "exitCode" in error &&
      typeof error.exitCode === "number"
        ? error.exitCode
        : undefined;

    if (!stdout && !stderr) {
      throw error;
    }

    return {
      command,
      exitCode,
      stderr,
      stdout,
    };
  }
}

export async function getSandboxDiff(input: SandboxDiffInput) {
  const result = await runSandboxCommand({
    command: SANDBOX_DIFF_COMMAND,
    sessionId: input.sessionId,
  });

  return result.stdout;
}
