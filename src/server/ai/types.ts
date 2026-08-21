import "server-only";

export type AIMessage =
  | {
      content: string;
      name?: string;
      role: "system" | "user";
    }
  | {
      content: string;
      name?: string;
      role: "assistant";
      tool_calls?: AIToolCall[];
    }
  | {
      content: string;
      name?: string;
      role: "tool";
      tool_call_id: string;
    };

export type AIJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type AIToolDefinition = {
  function: {
    description?: string;
    name: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
  };
  type: "function";
};

export type AIToolChoice =
  | "auto"
  | "none"
  | {
      function: {
        name: string;
      };
      type: "function";
    };

export type AIToolCall = {
  function: {
    arguments: string;
    name: string;
  };
  id: string;
  type: "function";
};

export type AIUsage = {
  completionTokens: number;
  cost?: number;
  promptTokens: number;
  reasoningTokens?: number;
  totalTokens: number;
};

export type AIGenerateTextInput = {
  maxTokens?: number;
  messages: AIMessage[];
  model?: string;
  responseFormat?:
    | {
        jsonSchema: AIJsonSchema;
        type: "json_schema";
      }
    | {
        type: "text";
      };
  temperature?: number;
  toolChoice?: AIToolChoice;
  tools?: AIToolDefinition[];
};

export type AIGenerateTextResult = {
  model: string;
  text: string;
  toolCalls?: AIToolCall[];
  usage?: AIUsage;
};

export type AIProvider = {
  generateText: (input: AIGenerateTextInput) => Promise<AIGenerateTextResult>;
};
