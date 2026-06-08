import "server-only";

/** Implements the app-owned write_file sandbox tool. */

import { sandboxProvider } from "~/server/sandbox/provider";
import { assertSandboxFileContentSize } from "~/server/sandbox/tools/files";
import type { SandboxWriteFileInput } from "~/server/sandbox/types";

/** Validates file size, then writes the content through the active sandbox provider. */
export async function writeSandboxFile(input: SandboxWriteFileInput) {
  assertSandboxFileContentSize(input.content);

  return sandboxProvider.writeRawFile(input);
}
