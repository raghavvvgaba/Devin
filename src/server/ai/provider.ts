import "server-only";

import { openRouterAiProvider } from "~/server/ai/providers/openrouter";

export const aiProvider = openRouterAiProvider;

export const aiProviderName = "openrouter";
