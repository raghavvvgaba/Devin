import "server-only";

import { env } from "~/env";
import { openRouterAiProvider } from "~/server/ai/providers/openrouter";
import { opencodeGoAiProvider } from "~/server/ai/providers/opencode-go";

export const aiProvider =
  env.AI_PROVIDER === "openrouter" ? openRouterAiProvider : opencodeGoAiProvider;

export const aiProviderName = env.AI_PROVIDER;
