import { beforeEach, describe, expect, it, vi } from "vitest";

import type { E2BSandboxSession } from "../types";

const { fileExistsMock, readTextFileMock } = vi.hoisted(() => ({
  fileExistsMock: vi.fn(),
  readTextFileMock: vi.fn(),
}));

vi.mock("~/server/sandbox/providers/e2b/sandbox-ops", () => ({
  fileExists: fileExistsMock,
  readTextFile: readTextFileMock,
}));

import { detectRepoPreviewConfig } from "../repo-detect";

const listMock = vi.fn();

function createSession(): E2BSandboxSession {
  return {
    logs: [],
    previewState: "offline",
    previewUrl: "https://preview.example.test",
    sandbox: {
      files: {
        list: listMock,
      },
    },
    sandboxId: "sandbox-test",
    sessionId: "session-test",
    status: "starting",
  } as unknown as E2BSandboxSession;
}

function usePackageJson(packageJson: unknown, existingFiles: string[] = []) {
  const files = new Set(["/home/user/repo/package.json", ...existingFiles]);
  fileExistsMock.mockImplementation(async (_session, path: string) => files.has(path));
  readTextFileMock.mockResolvedValue(JSON.stringify(packageJson));
}

beforeEach(() => {
  fileExistsMock.mockReset();
  readTextFileMock.mockReset();
  listMock.mockReset();
  listMock.mockResolvedValue([]);
});

describe("detectRepoPreviewConfig", () => {
  it("preserves root Vite React detection and startup", async () => {
    usePackageJson({
      dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
      devDependencies: { vite: "^7.0.0" },
      scripts: { dev: "vite" },
    });

    await expect(detectRepoPreviewConfig(createSession())).resolves.toEqual({
      installCommand: "npm install",
      kind: "vite-react",
      prepareCommand: undefined,
      previewCommand:
        "__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS='preview.example.test' npm run dev -- --host 0.0.0.0 --port 5173",
      previewCwd: "/home/user/repo",
    });
  });

  it("detects a root Next.js App Router repository", async () => {
    usePackageJson(
      {
        dependencies: { next: "^16.0.0", react: "^19.0.0", "react-dom": "^19.0.0" },
        scripts: { dev: "next dev" },
      },
      ["/home/user/repo/app"],
    );

    await expect(detectRepoPreviewConfig(createSession())).resolves.toEqual({
      installCommand: "npm install",
      kind: "nextjs",
      prepareCommand: undefined,
      previewCommand: "npm run dev -- --hostname 0.0.0.0 --port 5173",
      previewCwd: "/home/user/repo",
    });
  });

  it("uses the detected package manager for Next.js", async () => {
    usePackageJson(
      {
        dependencies: { next: "^15.0.0" },
        scripts: { dev: "next dev" },
      },
      ["/home/user/repo/pnpm-lock.yaml"],
    );

    await expect(detectRepoPreviewConfig(createSession())).resolves.toMatchObject({
      installCommand: "pnpm install",
      kind: "nextjs",
      previewCommand: "pnpm dev --hostname 0.0.0.0 --port 5173",
    });
  });

  it("keeps unsupported workspaces outside the first Next.js phase", async () => {
    usePackageJson({
      dependencies: { next: "^16.0.0" },
      scripts: { dev: "next dev" },
      workspaces: ["apps/*"],
    });

    await expect(detectRepoPreviewConfig(createSession())).rejects.toThrow(
      "Workspace/monorepo sandboxes are not supported yet",
    );
  });
});
