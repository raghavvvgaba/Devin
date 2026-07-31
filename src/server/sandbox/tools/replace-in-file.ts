import "server-only";

/** Implements the app-owned replace_in_file sandbox tool. */

import { z } from "zod";

import { sandboxProvider } from "~/server/sandbox/provider";
import { assertSandboxFileContentSize } from "~/server/sandbox/tools/files";
import type { SandboxAgentToolDefinition } from "~/server/sandbox/tools/types";
import type { SandboxSession } from "~/server/sandbox/types";

import DESCRIPTION from "./replace.txt";

export const REPLACE_CANDIDATE_LINE_CAP = 5;

type ReplaceInFileInput = {
  newText: string;
  oldText: string;
  path: string;
  sessionId: string;
  startLine: number;
};

type ReplaceInFileResult = {
  newText: string;
  oldText: string;
  path: string;
  session: SandboxSession;
  startLine: number;
};

function findOccurrenceIndexes(value: string, search: string) {
  const indexes: number[] = [];
  let index = value.indexOf(search);

  while (index !== -1) {
    indexes.push(index);
    index = value.indexOf(search, index + search.length);
  }

  return indexes;
}

function getLineNumberAtOffset(content: string, offset: number) {
  return content.slice(0, offset).split("\n").length;
}

function buildLineTextMismatchMessage(
  content: string,
  occurrenceIndexes: number[],
) {
  const candidateLines = [
    ...new Set(
      occurrenceIndexes.map((index) => getLineNumberAtOffset(content, index)),
    ),
  ];

  if (candidateLines.length === 0) {
    return "line_text_mismatch: oldText was not found elsewhere in the file";
  }

  const visibleCandidates = candidateLines.slice(0, REPLACE_CANDIDATE_LINE_CAP);
  const remainingCount = candidateLines.length - visibleCandidates.length;

  return [
    `line_text_mismatch: oldText found on candidate ${visibleCandidates.length === 1 ? "line" : "lines"} ${visibleCandidates.join(", ")}`,
    ...(remainingCount > 0 ? [`and ${remainingCount} more`] : []),
  ].join(" ");
}

export async function replaceSandboxFileText(
  input: ReplaceInFileInput,
): Promise<ReplaceInFileResult> {
  if (input.startLine < 1) {
    throw new Error("invalid_line_range");
  }

  if (!input.oldText) {
    throw new Error("missing_old_text");
  }

  const rawFile = await sandboxProvider.readRawFile({
    path: input.path,
    sessionId: input.sessionId,
  });
  const normalizedContent = rawFile.content.replace(/\r\n/g, "\n");
  const lines = normalizedContent === "" ? [] : normalizedContent.split("\n");
  const lineIndex = input.startLine - 1;
  const currentLine = lines[lineIndex];

  if (currentLine === undefined) {
    throw new Error("line_not_found");
  }

  const lineStartOffset =
    lineIndex === 0 ? 0 : lines.slice(0, lineIndex).join("\n").length + 1;
  const lineEndOffset = lineStartOffset + currentLine.length;
  const occurrenceIndexes = findOccurrenceIndexes(
    normalizedContent,
    input.oldText,
  );
  const targetOccurrenceIndexes = occurrenceIndexes.filter(
    (index) => index >= lineStartOffset && index <= lineEndOffset,
  );

  if (targetOccurrenceIndexes.length === 0) {
    throw new Error(
      buildLineTextMismatchMessage(normalizedContent, occurrenceIndexes),
    );
  }

  if (targetOccurrenceIndexes.length > 1) {
    throw new Error("ambiguous_line_match");
  }

  const matchIndex = targetOccurrenceIndexes[0]!;
  const content = [
    normalizedContent.slice(0, matchIndex),
    input.newText,
    normalizedContent.slice(matchIndex + input.oldText.length),
  ].join("");
  assertSandboxFileContentSize(content);

  const writeResult = await sandboxProvider.writeRawFile({
    content,
    path: input.path,
    sessionId: input.sessionId,
  });

  return {
    newText: input.newText,
    oldText: input.oldText,
    path: writeResult.path,
    session: writeResult.session,
    startLine: input.startLine,
  };
}

const replaceArgumentsSchema = z
  .object({
    newText: z.string(),
    oldText: z.string(),
    path: z.string(),
    startLine: z.number().int(),
  })
  .strict();

type ReplaceSandboxAgentToolArguments = z.infer<typeof replaceArgumentsSchema>;

export const replaceSandboxAgentTool = {
  description: DESCRIPTION,
  async execute(args, context) {
    const parsedArguments = replaceArgumentsSchema.parse(args);

    return replaceSandboxFileText({
      newText: parsedArguments.newText,
      oldText: parsedArguments.oldText,
      path: parsedArguments.path,
      sessionId: context.sessionId,
      startLine: parsedArguments.startLine,
    });
  },
  id: "replace_in_file",
  parameters: {
    additionalProperties: false,
    properties: {
      newText: {
        description:
          "Replacement text for the exact match, which may span multiple lines.",
        type: "string",
      },
      oldText: {
        description:
          "Exact existing text expected to begin on the target line; may span multiple lines.",
        type: "string",
      },
      path: {
        description: "Repository-relative file path to edit.",
        type: "string",
      },
      startLine: {
        description: "One-based line number where oldText is expected.",
        type: "integer",
      },
    },
    required: ["path", "startLine", "oldText", "newText"],
    type: "object",
  },
} satisfies SandboxAgentToolDefinition<
  ReplaceSandboxAgentToolArguments,
  ReplaceInFileResult
>;
