import { nextjsAdapter } from "./nextjs";
import type { FrameworkAdapter } from "./types";
import { viteReactAdapter } from "./vite-react";

// More specific application frameworks must run before underlying build tools.
// A Next.js repository can also use Vite for tests without being a Vite application.
export const frameworkAdapters: readonly FrameworkAdapter[] = [
  nextjsAdapter,
  viteReactAdapter,
];

export function detectFramework(packageJson: unknown) {
  for (const adapter of frameworkAdapters) {
    const match = adapter.detect(packageJson);
    if (match) return { adapter, match };
  }

  return null;
}
