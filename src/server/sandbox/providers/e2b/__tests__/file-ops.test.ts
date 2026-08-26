import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SandboxSession } from "~/server/sandbox/types";

const {
  getRunningSandboxToolSessionMock,
  recoverPreviewAfterEditMock,
  appendLogMock,
  publicSessionMock,
  setPreviewStateMock,
} = vi.hoisted(() => ({
  appendLogMock: vi.fn(),
  getRunningSandboxToolSessionMock: vi.fn(),
  publicSessionMock: vi.fn(),
  recoverPreviewAfterEditMock: vi.fn(),
  setPreviewStateMock: vi.fn(),
}));

vi.mock("~/server/sandbox/providers/e2b/lifecycle", () => ({
  getRunningSandboxToolSession: getRunningSandboxToolSessionMock,
}));

vi.mock("~/server/sandbox/providers/e2b/preview", () => ({
  recoverPreviewAfterEdit: recoverPreviewAfterEditMock,
}));

vi.mock("~/server/sandbox/providers/e2b/session-state", () => ({
  appendLog: appendLogMock,
  publicSession: publicSessionMock,
  setPreviewState: setPreviewStateMock,
}));

import {
  listRawSandboxFiles,
  readRawSandboxFile,
  writeRawSandboxFile,
} from "../file-ops";

const readMock = vi.fn();
const writeMock = vi.fn();
const listMock = vi.fn();

const publicSession: SandboxSession = {
  environmentId: "env-test",
  logs: [],
  previewState: "ready",
  previewUrl: "https://preview.test",
  sessionId: "session-test",
  status: "running",
};

beforeEach(() => {
  readMock.mockReset();
  writeMock.mockReset();
  listMock.mockReset();
  getRunningSandboxToolSessionMock.mockReset();
  recoverPreviewAfterEditMock.mockReset();
  appendLogMock.mockReset();
  publicSessionMock.mockReset();
  setPreviewStateMock.mockReset();

  getRunningSandboxToolSessionMock.mockResolvedValue({
    sandbox: {
      files: {
        list: listMock,
        read: readMock,
        write: writeMock,
      },
    },
  });
  publicSessionMock.mockReturnValue(publicSession);
});

describe("file-ops timeouts", () => {
  it("reads sandbox files with a 5 second timeout", async () => {
    readMock.mockResolvedValue("alpha");

    await readRawSandboxFile({
      path: "src/app/page.tsx",
      sessionId: "session-test",
    });

    expect(readMock).toHaveBeenCalledWith("/home/user/repo/src/app/page.tsx", {
      requestTimeoutMs: 5_000,
    });
  });

  it("lists sandbox files with a 20 second timeout", async () => {
    listMock.mockResolvedValue([]);

    await listRawSandboxFiles({
      path: ".",
      sessionId: "session-test",
    });

    expect(listMock).toHaveBeenCalledWith("/home/user/repo", {
      requestTimeoutMs: 20_000,
    });
  });

  it("writes sandbox files with a 15 second timeout", async () => {
    writeMock.mockResolvedValue(undefined);
    recoverPreviewAfterEditMock.mockResolvedValue(undefined);

    await writeRawSandboxFile({
      content: "export const value = 1;",
      path: "src/data/file.ts",
      sessionId: "session-test",
    });

    expect(writeMock).toHaveBeenCalledWith(
      "/home/user/repo/src/data/file.ts",
      "export const value = 1;",
      {
        requestTimeoutMs: 15_000,
      },
    );
  });
});
