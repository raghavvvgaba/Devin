import "server-only";

import { z } from "zod";

import { aiProvider } from "~/server/ai/provider";

const MAX_SOURCE_CHARACTERS = 4_000;
const MAX_RESULT_CHARACTERS = 6_000;

const aiEditSchema = z.object({
  summary: z.string().trim().min(1).max(240),
  updatedContent: z.string(),
});

export type GenerateSingleFileEditResult =
  | {
      model: string;
      status: "ok";
      summary: string;
      updatedContent: string;
    }
  | {
      status:
        | "error"
        | "invalid_response"
        | "missing_api_key"
        | "model_error"
        | "provider_rejected"
        | "rate_limited"
        | "no_changes"
        | "unsupported_file";
    };

type GenerateSingleFileEditInput = {
  filePath: string;
  issueTitle: string;
  originalContent: string;
  repoName: string;
  repoOwner: string;
  userInstruction: string;
};

function looksLikeUnsupportedText(content: string) {
  if (content.length > MAX_SOURCE_CHARACTERS) {
    return true;
  }

  return content.includes("\u0000");
}

function looksLikeInvalidResult(
  originalContent: string,
  updatedContent: string,
  userInstruction: string,
) {
  if (
    updatedContent.length === 0 &&
    !/\bempty|clear|delete|remove all\b/i.test(userInstruction)
  ) {
    return true;
  }

  if (updatedContent.length > MAX_RESULT_CHARACTERS) {
    return true;
  }

  if (updatedContent === originalContent) {
    return "no_changes" as const;
  }

  return false;
}

function buildSystemPrompt() {
  return [
    "You are a precise single-file code editor.",
    "You may edit exactly one existing text file.",
    "Respond in English.",
    "Do not ask clarifying questions.",
    "Make the best valid single-file edit from the provided instruction and current file content.",
    "Return valid JSON matching the provided schema.",
    "Do not include markdown fences or prose outside JSON.",
    "Preserve unrelated content and formatting unless the instruction requires changing it.",
    "Do not invent files, commands, or multi-file changes.",
  ].join(" ");
}

function buildUserPrompt(input: GenerateSingleFileEditInput) {
  return [
    `Repository: ${input.repoOwner}/${input.repoName}`,
    `Issue title: ${input.issueTitle}`,
    `Target file: ${input.filePath}`,
    "",
    "Instruction:",
    input.userInstruction,
    "Apply the instruction directly to this file.",
    "",
    "Current file content:",
    "```",
    input.originalContent,
    "```",
    "",
    "Return JSON with:",
    '- "summary": short sentence describing the file change',
    '- "updatedContent": the full final contents of the file after applying the instruction',
  ].join("\n");
}

function mapAiProviderError(error: unknown): Exclude<
  GenerateSingleFileEditResult,
  { status: "ok" }
>["status"] {
  const message = error instanceof Error ? error.message : "";

  if (
    message.includes("OPENROUTER_API_KEY") ||
    message.includes("authentication failed")
  ) {
    return "missing_api_key";
  }

  if (message.includes("rate limited")) {
    return "rate_limited";
  }

  if (message.includes("status 400")) {
    return "provider_rejected";
  }

  if (message.includes("model is not configured")) {
    return "model_error";
  }

  return "model_error";
}

export async function generateSingleFileEdit(
  input: GenerateSingleFileEditInput,
): Promise<GenerateSingleFileEditResult> {
  if (looksLikeUnsupportedText(input.originalContent)) {
    return { status: "unsupported_file" };
  }

  let result: Awaited<ReturnType<typeof aiProvider.generateText>>;

  try {
    result = await aiProvider.generateText({
      maxTokens: 3_000,
      messages: [
        {
          content: buildSystemPrompt(),
          role: "system",
        },
        {
          content: buildUserPrompt(input),
          role: "user",
        },
      ],
      responseFormat: {
        type: "json_schema",
        jsonSchema: {
          name: "single_file_edit",
          schema: {
            additionalProperties: false,
            properties: {
              summary: {
                maxLength: 240,
                minLength: 1,
                type: "string",
              },
              updatedContent: {
                type: "string",
              },
            },
            required: ["summary", "updatedContent"],
            type: "object",
          },
          strict: true,
        },
      },
      temperature: 0.1,
    });
  } catch (error) {
    console.error("Single-file AI edit generation failed:", error);
    return { status: mapAiProviderError(error) };
  }

  let parsed: z.infer<typeof aiEditSchema>;

  try {
    parsed = aiEditSchema.parse(JSON.parse(result.text));
  } catch {
    return { status: "invalid_response" };
  }

  const invalidResult = looksLikeInvalidResult(
    input.originalContent,
    parsed.updatedContent,
    input.userInstruction,
  );

  if (invalidResult) {
    return {
      status: invalidResult === "no_changes" ? "no_changes" : "invalid_response",
    };
  }

  return {
    model: result.model,
    status: "ok",
    summary: parsed.summary,
    updatedContent: parsed.updatedContent,
  };
}
