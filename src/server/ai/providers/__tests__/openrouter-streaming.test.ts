import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({
  env: {
    GITHUB_APP_CALLBACK_URL: "https://example.com/api/github/callback",
    OPENROUTER_API_KEY: "openrouter-test-key",
    OPENROUTER_MODEL: "deepseek-v4-flash",
  },
}));

import { openRouterAiProvider } from "../openrouter";

const encoder = new TextEncoder();

function streamResponse(parts: string[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) controller.enqueue(encoder.encode(part));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

function data(value: unknown) {
  return `data: ${JSON.stringify(value)}\n\n`;
}

describe("OpenRouter streaming", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reassembles split SSE events, ignores heartbeats and returns final usage", async () => {
    const first = data({
      choices: [{ delta: { content: '{"status":"completed",' } }],
      model: "deepseek/deepseek-v4-flash",
    });
    const second = data({
      choices: [{ delta: { content: '"message":"Done."}' } }],
      usage: {
        completion_tokens: 8,
        completion_tokens_details: { reasoning_tokens: 2 },
        cost: 0.001,
        prompt_tokens: 20,
        total_tokens: 28,
      },
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      streamResponse([
        ": OPENROUTER PROCESSING\n\n",
        first.slice(0, 17),
        first.slice(17),
        second,
        "data: [DONE]\n\n",
      ]),
    );
    const deltas: string[] = [];

    const result = await openRouterAiProvider.generateText({
      messages: [{ content: "Finish", role: "user" }],
      model: "deepseek-v4-flash",
      onTextDelta(delta) {
        deltas.push(delta);
      },
      stream: true,
    });

    expect(deltas).toEqual([
      '{"status":"completed",',
      '"message":"Done."}',
    ]);
    expect(result).toEqual({
      model: "deepseek/deepseek-v4-flash",
      text: '{"status":"completed","message":"Done."}',
      usage: {
        completionTokens: 8,
        cost: 0.001,
        promptTokens: 20,
        reasoningTokens: 2,
        totalTokens: 28,
      },
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ stream: true });
  });

  it("rejects malformed, errored and incomplete streams", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(streamResponse(["data: {bad json}\n\n"]))
      .mockResolvedValueOnce(
        streamResponse([
          data({ error: { code: 429, message: "Too many requests" } }),
        ]),
      )
      .mockResolvedValueOnce(
        streamResponse([
          data({ choices: [{ delta: { content: "partial" } }] }),
        ]),
      );

    const request = () =>
      openRouterAiProvider.generateText({
        messages: [{ content: "Finish", role: "user" }],
        stream: true,
      });

    await expect(request()).rejects.toThrow("malformed streaming event");
    await expect(request()).rejects.toThrow("rate limited");
    await expect(request()).rejects.toThrow("ended before [DONE]");
  });

  it("preserves HTTP error mapping before a stream begins", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("provider overloaded", { status: 429 }),
    );

    await expect(
      openRouterAiProvider.generateText({
        messages: [{ content: "Finish", role: "user" }],
        stream: true,
      }),
    ).rejects.toThrow("rate limited");
  });

  it("preserves the existing non-streaming response path", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Buffered." } }],
          model: "deepseek/deepseek-v4-flash",
        }),
        { status: 200 },
      ),
    );

    await expect(
      openRouterAiProvider.generateText({
        messages: [{ content: "Continue", role: "user" }],
      }),
    ).resolves.toMatchObject({ text: "Buffered." });

    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body)).stream).toBeUndefined();
  });
});
