import "server-only";

/** Implements the app-owned list_directory sandbox tool. */

import { sandboxProvider } from "~/server/sandbox/provider";
import type { SandboxFileEntry, SandboxListFilesInput } from "~/server/sandbox/types";

export async function listSandboxFiles(
  input: SandboxListFilesInput,
): Promise<SandboxFileEntry[]> {
  return sandboxProvider.listRawFiles(input);
}
