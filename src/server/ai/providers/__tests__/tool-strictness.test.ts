import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AIGenerateTextInput } from "~/server/ai/types";

vi.mock("~/env", () => ({
  env: {
    GITHUB_APP_CALLBACK_URL: "https://example.com/api/github/callback",
    OPENCODE_API_KEY: "opencode-test-key",
    OPENCODE_GO_MODEL: "deepseek-v4-flash",
    OPENROUTER_API_KEY: "openrouter-test-key",
    OPENROUTER_MODEL: "deepseek-v4-flash",
  },
}));

import { opencodeGoAiProvider } from "../opencode-go";
import { openRouterAiProvider } from "../openrouter";

const tool = {
  function: {
    description: "Replace text in a file.",
    name: "replace_in_file",
    parameters: {
      additionalProperties: false,
      properties: {
        newText: { type: "string" },
        oldText: { type: "string" },
        path: { type: "string" },
      },
      required: ["path", "oldText", "newText"],
      type: "object",
    },
  },
  type: "function" as const,
};

function buildInput(model: string): AIGenerateTextInput {
  return {
    messages: [{ content: "Update the file.", role: "user" }],
    model,
    toolChoice: "auto",
    tools: [tool],
  };
}

function successfulResponse(model: string) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: "Done." } }],
      model,
      usage: {
        completion_tokens: 1,
        prompt_tokens: 1,
        total_tokens: 2,
      },
    }),
    {
      headers: { "Content-Type": "application/json" },
      status: 200,
    },
  );
}

function getRequestBody(fetchMock: ReturnType<typeof vi.fn>) {
  const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return JSON.parse(String(request?.body)) as {
    provider?: { require_parameters?: boolean };
    tools?: Array<{ function: { strict?: boolean } }>;
  };
}

describe("AI provider tool strictness", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("enables strict tools and required-parameter routing for configured OpenRouter models", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      successfulResponse("deepseek/deepseek-v4-flash"),
    );

    await openRouterAiProvider.generateText(buildInput("deepseek-v4-flash"));

    const body = getRequestBody(fetchMock);
    expect(body.provider?.require_parameters).toBe(true);
    expect(body.tools?.[0]?.function.strict).toBe(true);
  });

  it("omits strict tools for unknown OpenRouter models", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(successfulResponse("vendor/unknown-model"));

    await openRouterAiProvider.generateText(buildInput("vendor/unknown-model"));

    const body = getRequestBody(fetchMock);
    expect(body.provider?.require_parameters).toBe(true);
    expect(body.tools?.[0]?.function.strict).toBeUndefined();
  });

  it("leaves OpenCode Go tool definitions unchanged", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(successfulResponse("deepseek-v4-flash"));

    await opencodeGoAiProvider.generateText(buildInput("deepseek-v4-flash"));

    const body = getRequestBody(fetchMock);
    expect(body.provider).toBeUndefined();
    expect(body.tools?.[0]?.function.strict).toBeUndefined();
  });
});
