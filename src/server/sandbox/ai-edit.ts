import "server-only";

import { generateSingleFileEdit } from "~/server/ai/single-file-edit";
import { getSandboxDiff } from "~/server/sandbox/tools/diff";
import { readSandboxFile } from "~/server/sandbox/tools/read-file";
import { writeSandboxFile } from "~/server/sandbox/tools/write-file";
import type { SandboxSession } from "~/server/sandbox/types";

export type PreparedSandboxEdit =
  | {
      diff: string;
      filePath: string;
      model: string;
      originalContent: string;
      session: SandboxSession;
      status: "ok";
      summary: string;
      updatedContent: string;
    }
  | {
      status:
        | "error"
        | "file_not_found"
        | "invalid_path"
        | "invalid_response"
        | "missing_api_key"
        | "model_error"
        | "no_changes"
        | "provider_rejected"
        | "rate_limited"
        | "sandbox_not_running"
        | "unsupported_file";
    };

type PrepareSandboxSingleFileAiEditInput = {
  filePath: string;
  issueTitle: string;
  repoName: string;
  repoOwner: string;
  sessionId: string;
  userInstruction: string;
};

function mapSandboxFileError(
  error: unknown,
): Exclude<PreparedSandboxEdit["status"], "ok"> {
  const message = error instanceof Error ? error.message : "";

  if (message === "invalid_path") {
    return "invalid_path";
  }

  if (message === "Sandbox is not running.") {
    return "sandbox_not_running";
  }

  if (
    message.includes("ENOENT") ||
    message.includes("No such file") ||
    message.includes("not found")
  ) {
    return "file_not_found";
  }

  return "error";
}

export async function prepareSandboxSingleFileAiEdit(
  input: PrepareSandboxSingleFileAiEditInput,
): Promise<PreparedSandboxEdit> {
  let file: Awaited<
    ReturnType<typeof readSandboxFile>
  >;

  try {
    file = await readSandboxFile({
      endLine: -1,
      path: input.filePath,
      sessionId: input.sessionId,
      startLine: 1,
    });
  } catch (error) {
    return { status: mapSandboxFileError(error) };
  }

  const aiEdit = await generateSingleFileEdit({
    filePath: file.path,
    issueTitle: input.issueTitle,
    originalContent: file.content,
    repoName: input.repoName,
    repoOwner: input.repoOwner,
    userInstruction: input.userInstruction,
  });

  if (aiEdit.status !== "ok") {
    return { status: aiEdit.status };
  }

  let writeResult: Awaited<
    ReturnType<typeof writeSandboxFile>
  >;

  try {
    writeResult = await writeSandboxFile({
      content: aiEdit.updatedContent,
      path: file.path,
      sessionId: input.sessionId,
    });
  } catch (error) {
    return { status: mapSandboxFileError(error) };
  }

  let diff = "";

  try {
    diff = await getSandboxDiff({ sessionId: input.sessionId });
  } catch {
    diff = "";
  }

  return {
    diff,
    filePath: file.path,
    model: aiEdit.model,
    originalContent: file.content,
    session: writeResult.session,
    status: "ok",
    summary: aiEdit.summary,
    updatedContent: aiEdit.updatedContent,
  };
}
