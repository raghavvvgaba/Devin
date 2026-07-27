import "server-only";

import { env } from "~/env";
import { toOpenRouterModelId } from "~/lib/agent-models";
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
        "X-OpenRouter-Title": "Devin",
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
        tool_choice: input.toolChoice,
        tools: input.tools,
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
