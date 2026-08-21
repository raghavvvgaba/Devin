import { describe, expect, it } from "vitest";

import {
  AGENT_MODELS,
  DEFAULT_AGENT_MODEL,
  supportsStrictToolArguments,
  toOpenRouterModelId,
} from "~/lib/agent-models";

describe("agent model mappings", () => {
  it("maps every selectable model to its OpenRouter model ID", () => {
    expect(
      Object.fromEntries(
        AGENT_MODELS.map(({ id }) => [id, toOpenRouterModelId(id)]),
      ),
    ).toEqual({
      "deepseek-v4-flash": "deepseek/deepseek-v4-flash",
      "deepseek-v4-pro": "deepseek/deepseek-v4-pro",
      "glm-5.1": "z-ai/glm-5.1",
      "glm-5.2": "z-ai/glm-5.2",
      "kimi-k2.6": "moonshotai/kimi-k2.6",
      "kimi-k2.7-code": "moonshotai/kimi-k2.7-code",
      "mimo-v2.5": "xiaomi/mimo-v2.5",
      "mimo-v2.5-pro": "xiaomi/mimo-v2.5-pro",
    });
  });

  it("keeps the default model selectable and mapped", () => {
    expect(AGENT_MODELS.some(({ id }) => id === DEFAULT_AGENT_MODEL)).toBe(true);
    expect(toOpenRouterModelId(DEFAULT_AGENT_MODEL)).toBe(
      "deepseek/deepseek-v4-flash",
    );
  });

  it("declares strict tool-argument support for every selectable model", () => {
    expect(
      AGENT_MODELS.map(({ id, openRouterId, supportsStrictToolArguments }) => ({
        id,
        openRouterId,
        supportsStrictToolArguments,
      })),
    ).toEqual(
      AGENT_MODELS.map(({ id, openRouterId }) => ({
        id,
        openRouterId,
        supportsStrictToolArguments: true,
      })),
    );

    for (const model of AGENT_MODELS) {
      expect(supportsStrictToolArguments(model.id)).toBe(true);
      expect(supportsStrictToolArguments(model.openRouterId)).toBe(true);
    }
  });

  it("defaults unknown models to non-strict tool arguments", () => {
    expect(supportsStrictToolArguments("vendor/unknown-model")).toBe(false);
  });

  it("preserves an already-qualified custom OpenRouter model ID", () => {
    expect(toOpenRouterModelId("anthropic/claude-opus-5")).toBe(
      "anthropic/claude-opus-5",
    );
  });
});
