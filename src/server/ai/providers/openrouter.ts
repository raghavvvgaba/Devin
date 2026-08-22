import "server-only";

import { env } from "~/env";
import {
  supportsStrictToolArguments,
  toOpenRouterModelId,
} from "~/lib/agent-models";
import type {
  AIGenerateTextInput,
  AIGenerateTextResult,
  AIProvider,
  AIToolCall,
  AIUsage,
} from "~/server/ai/types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

type OpenRouterMessageContent =
  | string
  | Array<{
      text?: string;
      type?: string;
    }>;

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: OpenRouterMessageContent;
      tool_calls?: Array<{
        function?: {
          arguments?: string;
          name?: string;
        };
        id?: string;
        type?: string;
      }>;
    };
  }>;
  model?: string;
  usage?: {
    completion_tokens?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
    cost?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  };
};

type OpenRouterStreamChunk = OpenRouterResponse & {
  choices?: Array<{
    delta?: {
      content?: OpenRouterMessageContent;
    };
  }>;
  error?: {
    code?: number | string;
    message?: string;
  };
};

function getResponseText(response: OpenRouterResponse) {
  const content = response.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (part?.type === "text" ? part.text ?? "" : ""))
      .join("");
  }

  return "";
}

function getMessageContentText(content: OpenRouterMessageContent | undefined) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (part?.type === "text" ? part.text ?? "" : ""))
      .join("");
  }

  return "";
}

function getToolCalls(response: OpenRouterResponse): AIToolCall[] {
  const toolCalls = response.choices?.[0]?.message?.tool_calls;

  if (!Array.isArray(toolCalls)) {
    return [];
  }

  return toolCalls.flatMap((toolCall, index) => {
    if (
      toolCall?.type !== "function" ||
      !toolCall.function?.name ||
      typeof toolCall.function.arguments !== "string"
    ) {
      return [];
    }

    return [
      {
        function: {
          arguments: toolCall.function.arguments,
          name: toolCall.function.name,
        },
        id: toolCall.id ?? `tool_call_${index}`,
        type: "function",
      } satisfies AIToolCall,
    ];
  });
}

function getUsage(response: OpenRouterResponse): AIUsage | undefined {
  const usage = response.usage;

  if (
    typeof usage?.prompt_tokens !== "number" ||
    typeof usage.completion_tokens !== "number" ||
    typeof usage.total_tokens !== "number"
  ) {
    return undefined;
  }

  return {
    completionTokens: usage.completion_tokens,
    cost: usage.cost,
    promptTokens: usage.prompt_tokens,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens,
    totalTokens: usage.total_tokens,
  };
}

function getOpenRouterModel(modelOverride?: string) {
  const model = modelOverride ?? env.OPENROUTER_MODEL;
  return model ? toOpenRouterModelId(model) : undefined;
}

function buildOpenRouterTools(
  tools: AIGenerateTextInput["tools"],
  model: string,
) {
  if (!tools || !supportsStrictToolArguments(model)) {
    return tools;
  }

  return tools.map((tool) => ({
    ...tool,
    function: {
      ...tool.function,
      strict: true,
    },
  }));
}

function describeOpenRouterStreamError(error: OpenRouterStreamChunk["error"]) {
  const message = error?.message?.trim() || "Unknown streaming error.";
  const code = error?.code;

  if (code === 429 || code === "429") {
    return `OpenRouter request was rate limited. Response: ${message}`;
  }

  return `OpenRouter stream failed.${code !== undefined ? ` Code: ${code}.` : ""} Response: ${message}`;
}

async function readOpenRouterStream(
  response: Response,
  input: AIGenerateTextInput,
  fallbackModel: string,
): Promise<AIGenerateTextResult> {
  if (!response.body) {
    throw new Error("OpenRouter returned an empty streaming response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  let model = fallbackModel;
  let text = "";
  let usage: AIUsage | undefined;

  const processLine = async (rawLine: string) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

    if (!line || line.startsWith(":")) {
      return;
    }

    if (!line.startsWith("data:")) {
      return;
    }

    const payload = line.slice(5).trimStart();

    if (payload === "[DONE]") {
      completed = true;
      return;
    }

    let chunk: OpenRouterStreamChunk;

    try {
      chunk = JSON.parse(payload) as OpenRouterStreamChunk;
    } catch {
      throw new Error("OpenRouter returned a malformed streaming event.");
    }

    if (chunk.error) {
      throw new Error(describeOpenRouterStreamError(chunk.error));
    }

    if (chunk.model) {
      model = chunk.model;
    }

    const chunkUsage = getUsage(chunk);
    if (chunkUsage) {
      usage = chunkUsage;
    }

    const delta = getMessageContentText(chunk.choices?.[0]?.delta?.content);
    if (!delta) {
      return;
    }

    text += delta;
    await input.onTextDelta?.(delta);
  };

  while (!completed) {
    const { done, value } = await reader.read();

    if (done) {
      buffer += decoder.decode();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      await processLine(line);
      if (completed) break;
    }
  }

  if (!completed && buffer) {
    await processLine(buffer);
  }

  if (!completed) {
    throw new Error("OpenRouter streaming response ended before [DONE].");
  }

  if (!text) {
    throw new Error("OpenRouter returned an empty response.");
  }

  return {
    model,
    text,
    ...(usage ? { usage } : {}),
  };
}

async function generateText(
  input: AIGenerateTextInput,
): Promise<AIGenerateTextResult> {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error(
      "OpenRouter is not configured. Set OPENROUTER_API_KEY to enable AI requests.",
    );
  }

  const model = getOpenRouterModel(input.model);

  if (!model) {
    throw new Error(
      "OpenRouter model is not configured. Set OPENROUTER_MODEL to enable AI requests.",
    );
  }

  let response: Response;

  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": new URL(env.GITHUB_APP_CALLBACK_URL).origin,
        "X-OpenRouter-Title": "Inlaya",
      },
      body: JSON.stringify({
        max_tokens: input.maxTokens,
        messages: input.messages,
        model,
        provider: {
          data_collection: "deny",
          require_parameters: true,
        },
        response_format:
          input.responseFormat?.type === "json_schema"
            ? {
                type: "json_schema",
                json_schema: {
                  name: input.responseFormat.jsonSchema.name,
                  strict: input.responseFormat.jsonSchema.strict ?? true,
                  schema: input.responseFormat.jsonSchema.schema,
                },
              }
            : undefined,
        temperature: input.temperature,
        stream: input.stream || undefined,
        tool_choice: input.toolChoice,
        tools: buildOpenRouterTools(input.tools, model),
      }),
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`OpenRouter request failed. ${message}`);
  }

  if (!response.ok) {
    const bodyText = await response.text();
    const preview = bodyText.trim().replace(/\s+/g, " ").slice(0, 280);

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `OpenRouter authentication failed.${preview ? ` Response: ${preview}` : ""}`,
      );
    }

    if (response.status === 429) {
      throw new Error(
        `OpenRouter request was rate limited.${preview ? ` Response: ${preview}` : ""}`,
      );
    }

    throw new Error(
      `OpenRouter request failed with status ${response.status}.${preview ? ` Response: ${preview}` : ""}`,
    );
  }

  if (input.stream) {
    return readOpenRouterStream(response, input, model);
  }

  let data: OpenRouterResponse;

  try {
    data = (await response.json()) as OpenRouterResponse;
  } catch {
    throw new Error("OpenRouter returned invalid JSON.");
  }

  const text = getResponseText(data);
  const toolCalls = getToolCalls(data);
  const usage = getUsage(data);

  if (!text && toolCalls.length === 0) {
    throw new Error("OpenRouter returned an empty response.");
  }

  return {
    model: data.model ?? model,
    text,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(usage ? { usage } : {}),
  };
}

export const openRouterAiProvider: AIProvider = {
  generateText,
};
