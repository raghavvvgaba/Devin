import {
  DEFAULT_SANDBOX_READ_LINE_COUNT,
  DEFAULT_SANDBOX_READ_MAX_CHARACTERS,
} from "~/server/sandbox/providers/e2b/constants";
import { getRunningSandboxToolSession } from "~/server/sandbox/providers/e2b/lifecycle";
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
import { assertSandboxFileContentSize } from "~/server/sandbox/tools/files";
import type {
  SandboxFile,
  SandboxFileEntry,
  SandboxFileInput,
  SandboxListFilesInput,
  SandboxWriteFileInput,
} from "~/server/sandbox/types";

function sliceSandboxFileContent(
  content: string,
  input: SandboxFileInput,
): SandboxFile {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const lines = normalizedContent === "" ? [] : normalizedContent.split("\n");
  const totalLines = lines.length;
  const requestedStartLine = input.startLine ?? 1;
  const hasExplicitEndLine = typeof input.endLine === "number";
  const requestedEndLine = input.endLine ?? DEFAULT_SANDBOX_READ_LINE_COUNT;

  if (requestedStartLine < 1) {
    throw new Error("invalid_line_range");
  }

  if (requestedEndLine !== -1 && requestedEndLine < requestedStartLine) {
    throw new Error("invalid_line_range");
  }

  const startLine = Math.min(requestedStartLine, totalLines === 0 ? 1 : totalLines);
  const endLine =
    requestedEndLine === -1
      ? totalLines
      : Math.min(requestedEndLine, totalLines === 0 ? 1 : totalLines);

  if (totalLines === 0) {
    return {
      content: "",
      endLine: 0,
      path: input.path,
      size: 0,
      startLine: 0,
      totalLines: 0,
      truncated: false,
    };
  }

  let effectiveEndLine = endLine;

  if (!hasExplicitEndLine) {
    let characterCount = 0;
    let limitedEndLine = startLine - 1;

    for (let index = startLine - 1; index < endLine; index += 1) {
      const line = lines[index] ?? "";
      const nextCharacterCount =
        characterCount + line.length + (limitedEndLine >= startLine ? 1 : 0);

      if (
        limitedEndLine >= startLine &&
        nextCharacterCount > DEFAULT_SANDBOX_READ_MAX_CHARACTERS
      ) {
        break;
      }

      characterCount = nextCharacterCount;
      limitedEndLine = index + 1;

      if (characterCount >= DEFAULT_SANDBOX_READ_MAX_CHARACTERS) {
        break;
      }
    }

    effectiveEndLine = Math.max(startLine, limitedEndLine);
  }

  const snippet = lines.slice(startLine - 1, effectiveEndLine).join("\n");

  return {
    content: snippet,
    endLine: effectiveEndLine,
    path: input.path,
    size: Buffer.byteLength(content, "utf8"),
    startLine,
    totalLines,
    truncated: startLine !== 1 || effectiveEndLine !== totalLines,
  };
}

export async function readSandboxFile(input: SandboxFileInput): Promise<SandboxFile> {
  const session = await getRunningSandboxToolSession(input.sessionId);
  const relativePath = normalizeSandboxRelativePath(input.path);
  const sandboxPath = toSandboxRepoPath(relativePath);
  const content = await session.sandbox!.files.read(sandboxPath, {
    requestTimeoutMs: 10_000,
  });
  const file = sliceSandboxFileContent(content, {
    ...input,
    path: relativePath,
  });

  return file;
}

export async function writeSandboxFile(input: SandboxWriteFileInput) {
  const session = await getRunningSandboxToolSession(input.sessionId);
  const relativePath = normalizeSandboxRelativePath(input.path);
  const sandboxPath = toSandboxRepoPath(relativePath);
  assertSandboxFileContentSize(input.content);

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

export async function listSandboxFiles(
  input: SandboxListFilesInput,
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
