import "server-only";

/** Implements the app-owned write_file sandbox tool. */

import { z } from "zod";

import { sandboxProvider } from "~/server/sandbox/provider";
import { assertSandboxFileContentSize } from "~/server/sandbox/tools/files";
import type { SandboxAgentToolDefinition } from "~/server/sandbox/tools/types";
import type { SandboxSession, SandboxWriteFileInput } from "~/server/sandbox/types";

import DESCRIPTION from "./write.txt";

/** Validates file size, then writes the content through the active sandbox provider. */
export async function writeSandboxFile(input: SandboxWriteFileInput) {
  assertSandboxFileContentSize(input.content);

  return sandboxProvider.writeRawFile(input);
}

const writeArgumentsSchema = z
  .object({
    content: z.string(),
    path: z.string(),
  })
  .strict();

type WriteSandboxAgentToolResult = {
  path: string;
  session: SandboxSession;
};

type WriteSandboxAgentToolArguments = z.infer<typeof writeArgumentsSchema>;

export const writeSandboxAgentTool = {
  description: DESCRIPTION,
  async execute(args, context) {
    const parsedArguments = writeArgumentsSchema.parse(args);

    return writeSandboxFile({
      content: parsedArguments.content,
      ...(context.deferPreviewRecovery
        ? { deferPreviewRecovery: true }
        : {}),
      path: parsedArguments.path,
      sessionId: context.sessionId,
    });
  },
  id: "write_file",
  parameters: {
    additionalProperties: false,
    properties: {
      content: {
        description: "Complete final file contents to write.",
        type: "string",
      },
      path: {
        description: "Repository-relative file path to overwrite.",
        type: "string",
      },
    },
    required: ["path", "content"],
    type: "object",
  },
} satisfies SandboxAgentToolDefinition<
  WriteSandboxAgentToolArguments,
  WriteSandboxAgentToolResult
>;
