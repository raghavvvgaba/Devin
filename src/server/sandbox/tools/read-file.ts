import "server-only";

/** Implements the app-owned read_file sandbox tool. */

import {
  DEFAULT_SANDBOX_READ_LINE_COUNT,
  DEFAULT_SANDBOX_READ_MAX_CHARACTERS,
} from "~/server/sandbox/providers/e2b/constants";
import { sandboxProvider } from "~/server/sandbox/provider";
import type { SandboxFile, SandboxFileInput } from "~/server/sandbox/types";

/** Normalizes line breaks, validates ranges, applies snippet limits, and returns line metadata. */
function sliceSandboxFileContent(
  content: string,
  input: SandboxFileInput,
): Omit<SandboxFile, "path" | "size"> {
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

  return {
    content: lines.slice(startLine - 1, effectiveEndLine).join("\n"),
    endLine: effectiveEndLine,
    startLine,
    totalLines,
    truncated: startLine !== 1 || effectiveEndLine !== totalLines,
  };
}

/** Reads a raw sandbox file, then applies range and truncation rules. */
export async function readSandboxFile(input: SandboxFileInput): Promise<SandboxFile> {
  const rawFile = await sandboxProvider.readRawFile({
    path: input.path,
    sessionId: input.sessionId,
  });
  const snippet = sliceSandboxFileContent(rawFile.content, input);

  return {
    ...snippet,
    path: rawFile.path,
    size: rawFile.size,
  };
}
