import { describe, expect, it } from "vitest";

import { detectFramework } from "../index";
import { nextjsAdapter } from "../nextjs";
import { viteReactAdapter } from "../vite-react";

const previewContext = {
  previewHost: "preview.example.test",
  previewPort: 5173,
} as const;

describe("framework adapters", () => {
  it("detects Next.js from its package and dev script", () => {
    const detected = detectFramework({
      dependencies: { next: "^16.0.0", react: "^19.0.0", "react-dom": "^19.0.0" },
      scripts: { dev: "next dev" },
    });

    expect(detected?.adapter.kind).toBe("nextjs");
  });

  it("does not detect a Next.js package without a dev script", () => {
    expect(nextjsAdapter.detect({ dependencies: { next: "^16.0.0" } })).toBeNull();
  });

  it("prefers Next.js when Vite is also used by the repository", () => {
    const detected = detectFramework({
      dependencies: {
        next: "^16.0.0",
        react: "^19.0.0",
        "react-dom": "^19.0.0",
      },
      devDependencies: { vite: "^7.0.0" },
      scripts: { dev: "next dev" },
    });

    expect(detected?.adapter.kind).toBe("nextjs");
  });

  it.each([
    ["npm", "npm run dev -- --hostname 0.0.0.0 --port 5173"],
    ["pnpm", "pnpm dev --hostname 0.0.0.0 --port 5173"],
    ["yarn", "yarn dev --hostname 0.0.0.0 --port 5173"],
    [
      "bun",
      'export PATH="$HOME/.bun/bin:$PATH"; bun run dev --hostname 0.0.0.0 --port 5173',
    ],
  ] as const)("creates the Next.js preview command for %s", (packageManager, expected) => {
    expect(
      nextjsAdapter.createPreviewCommand({
        ...previewContext,
        packageManager,
      }),
    ).toBe(expected);
  });

  it("preserves the existing Vite React npm preview command", () => {
    expect(
      viteReactAdapter.createPreviewCommand({
        ...previewContext,
        packageManager: "npm",
      }),
    ).toBe(
      "__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS='preview.example.test' npm run dev -- --host 0.0.0.0 --port 5173",
    );
  });
});
