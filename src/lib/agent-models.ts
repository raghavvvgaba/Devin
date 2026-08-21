// When adding a model, verify `tools` and `structured_outputs` in OpenRouter's
// `/api/v1/models` metadata and declare strict tool-argument support explicitly.
export const AGENT_MODELS = [
  {
    id: "glm-5.2",
    label: "GLM-5.2",
    openRouterId: "z-ai/glm-5.2",
    supportsStrictToolArguments: true,
  },
  {
    id: "glm-5.1",
    label: "GLM-5.1",
    openRouterId: "z-ai/glm-5.1",
    supportsStrictToolArguments: true,
  },
  {
    id: "kimi-k2.7-code",
    label: "Kimi K2.7 Code",
    openRouterId: "moonshotai/kimi-k2.7-code",
    supportsStrictToolArguments: true,
  },
  {
    id: "kimi-k2.6",
    label: "Kimi K2.6",
    openRouterId: "moonshotai/kimi-k2.6",
    supportsStrictToolArguments: true,
  },
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    openRouterId: "deepseek/deepseek-v4-pro",
    supportsStrictToolArguments: true,
  },
  {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    openRouterId: "deepseek/deepseek-v4-flash",
    supportsStrictToolArguments: true,
  },
  {
    id: "mimo-v2.5",
    label: "MiMo-V2.5",
    openRouterId: "xiaomi/mimo-v2.5",
    supportsStrictToolArguments: true,
  },
  {
    id: "mimo-v2.5-pro",
    label: "MiMo-V2.5-Pro",
    openRouterId: "xiaomi/mimo-v2.5-pro",
    supportsStrictToolArguments: true,
  },
] as const;

export const DEFAULT_AGENT_MODEL = "deepseek-v4-flash";

export type AgentModelId = (typeof AGENT_MODELS)[number]["id"];

const AGENT_MODEL_IDS = new Set<string>(AGENT_MODELS.map((m) => m.id));

export function isAgentModelId(value: unknown): value is AgentModelId {
  return typeof value === "string" && AGENT_MODEL_IDS.has(value);
}

export function getAgentModelLabel(id: string): string {
  return AGENT_MODELS.find((m) => m.id === id)?.label ?? id;
}

export function toOpenRouterModelId(id: string): string {
  return AGENT_MODELS.find((model) => model.id === id)?.openRouterId ?? id;
}

export function supportsStrictToolArguments(id: string): boolean {
  return (
    AGENT_MODELS.find(
      (model) => model.id === id || model.openRouterId === id,
    )?.supportsStrictToolArguments ?? false
  );
}
