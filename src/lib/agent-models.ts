export const AGENT_MODELS = [
  { id: "glm-5.2", label: "GLM-5.2", openRouterId: "z-ai/glm-5.2" },
  { id: "glm-5.1", label: "GLM-5.1", openRouterId: "z-ai/glm-5.1" },
  {
    id: "kimi-k2.7-code",
    label: "Kimi K2.7 Code",
    openRouterId: "moonshotai/kimi-k2.7-code",
  },
  {
    id: "kimi-k2.6",
    label: "Kimi K2.6",
    openRouterId: "moonshotai/kimi-k2.6",
  },
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    openRouterId: "deepseek/deepseek-v4-pro",
  },
  {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    openRouterId: "deepseek/deepseek-v4-flash",
  },
  {
    id: "mimo-v2.5",
    label: "MiMo-V2.5",
    openRouterId: "xiaomi/mimo-v2.5",
  },
  {
    id: "mimo-v2.5-pro",
    label: "MiMo-V2.5-Pro",
    openRouterId: "xiaomi/mimo-v2.5-pro",
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
