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

function buildAmbiguousMatchMessage(
  content: string,
  occurrenceIndexes: number[],
) {
  const candidateLines = [
    ...new Set(
      occurrenceIndexes.map((index) => getLineNumberAtOffset(content, index)),
    ),
  ];

  const visibleCandidates = candidateLines.slice(0, REPLACE_CANDIDATE_LINE_CAP);
  const remainingCount = candidateLines.length - visibleCandidates.length;

  return [
    `ambiguous_text_match: oldText matched ${occurrenceIndexes.length} times on ${visibleCandidates.length === 1 ? "line" : "lines"} ${visibleCandidates.join(", ")}`,
    ...(remainingCount > 0 ? [`and ${remainingCount} more`] : []),
    "Provide more surrounding text so oldText matches exactly once.",
  ].join(" ");
}

export async function replaceSandboxFileText(
  input: ReplaceInFileInput,
): Promise<ReplaceInFileResult> {
  if (!input.oldText) {
    throw new Error("missing_old_text");
  }

  const rawFile = await sandboxProvider.readRawFile({
    path: input.path,
    sessionId: input.sessionId,
  });
  const normalizedContent = rawFile.content.replace(/\r\n/g, "\n");
  const occurrenceIndexes = findOccurrenceIndexes(
    normalizedContent,
    input.oldText,
  );

  if (occurrenceIndexes.length === 0) {
    throw new Error(
      "text_not_found: oldText was not found exactly in the current file. Re-read the relevant lines before retrying.",
    );
  }

  if (occurrenceIndexes.length > 1) {
    throw new Error(
      buildAmbiguousMatchMessage(normalizedContent, occurrenceIndexes),
    );
  }

  const matchIndex = occurrenceIndexes[0]!;
  const startLine = getLineNumberAtOffset(normalizedContent, matchIndex);
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
    startLine,
  };
}

const replaceArgumentsSchema = z
  .object({
    newText: z.string(),
    oldText: z.string(),
    path: z.string(),
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
          "Exact existing text to replace. Include enough surrounding text to make the match unique; may span multiple lines.",
        type: "string",
      },
      path: {
        description: "Repository-relative file path to edit.",
        type: "string",
      },
    },
    required: ["path", "oldText", "newText"],
    type: "object",
  },
} satisfies SandboxAgentToolDefinition<
  ReplaceSandboxAgentToolArguments,
  ReplaceInFileResult
>;
