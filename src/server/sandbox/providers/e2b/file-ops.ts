import {
  getRunningSandboxToolSession,
} from "~/server/sandbox/providers/e2b/lifecycle";
import { recoverPreviewAfterEdit } from "~/server/sandbox/providers/e2b/preview";
import {
  appendLog,
  publicSession,
  setPreviewState,
} from "~/server/sandbox/providers/e2b/session-state";
import {
  normalizeSandboxRelativePath,
  shouldHideSandboxEntry,
  toSandboxRepoPath,
} from "~/server/sandbox/tools/paths";
import type {
  SandboxFileEntry,
  SandboxRawFile,
  SandboxRawFileInput,
  SandboxRawListFilesInput,
  SandboxRawWriteFileInput,
} from "~/server/sandbox/types";

export async function readRawSandboxFile(
  input: SandboxRawFileInput,
): Promise<SandboxRawFile> {
  const session = await getRunningSandboxToolSession(input.sessionId);
  const relativePath = normalizeSandboxRelativePath(input.path);
  const sandboxPath = toSandboxRepoPath(relativePath);
  const content = await session.sandbox!.files.read(sandboxPath, {
    requestTimeoutMs: 10_000,
  });

  return {
    content,
    path: relativePath,
    size: Buffer.byteLength(content, "utf8"),
  };
}

export async function writeRawSandboxFile(input: SandboxRawWriteFileInput) {
  const session = await getRunningSandboxToolSession(input.sessionId);
  const relativePath = normalizeSandboxRelativePath(input.path);
  const sandboxPath = toSandboxRepoPath(relativePath);

  await session.sandbox!.files.write(sandboxPath, input.content, {
    requestTimeoutMs: 15_000,
  });
  appendLog(session, `\nWrote ${relativePath}\n`);

  setPreviewState(session, "recovering", "Saving change and refreshing preview.");
  await recoverPreviewAfterEdit(session);

  return {
    path: relativePath,
    session: publicSession(session),
  };
}

export async function listRawSandboxFiles(
  input: SandboxRawListFilesInput,
): Promise<SandboxFileEntry[]> {
  const session = await getRunningSandboxToolSession(input.sessionId);
  const relativePath = normalizeSandboxRelativePath(input.path, { allowRoot: true });
  const sandboxPath = toSandboxRepoPath(relativePath);
  const entries = await session.sandbox!.files.list(sandboxPath, {
    requestTimeoutMs: 10_000,
  });

  return entries
    .filter((entry) => !shouldHideSandboxEntry(entry.name))
    .map((entry) => {
      const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const type = String(entry.type ?? "unknown");

      return {
        name: entry.name,
        path: entryPath,
        size: entry.size,
        type: type === "dir" || type === "file" ? type : "unknown",
      };
    });
}
