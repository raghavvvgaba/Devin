import { beforeEach, describe, expect, it, vi } from "vitest";

const { readRawFileMock, writeRawFileMock } = vi.hoisted(() => ({
  readRawFileMock: vi.fn(),
  writeRawFileMock: vi.fn(),
}));

vi.mock("~/server/sandbox/provider", () => ({
  sandboxProvider: {
    readRawFile: readRawFileMock,
    writeRawFile: writeRawFileMock,
  },
}));

import { MAX_SANDBOX_FILE_BYTES } from "../files";
import {
  REPLACE_CANDIDATE_LINE_CAP,
  replaceSandboxFileText,
} from "../replace-in-file";

const mockSession = {
  environmentId: "env-test",
  logs: [],
  previewState: "ready",
  previewUrl: "https://preview.test",
  sessionId: "session-test",
  status: "running",
};

function buildInput(
  overrides: Partial<Parameters<typeof replaceSandboxFileText>[0]> = {},
) {
  return {
    newText: "Full stack + AI engineer",
    oldText: "Full stack developer",
    path: "src/components/Hero.jsx",
    sessionId: "session-test",
    startLine: 2,
    ...overrides,
  };
}

beforeEach(() => {
  readRawFileMock.mockReset();
  writeRawFileMock.mockReset();

  readRawFileMock.mockResolvedValue({
    content: "first line\nFull stack developer\nlast line",
    path: "src/components/Hero.jsx",
    size: 42,
  });
  writeRawFileMock.mockResolvedValue({
    path: "src/components/Hero.jsx",
    session: mockSession,
  });
});

describe("replaceSandboxFileText", () => {
  it("replaces text on the requested line and writes updated content", async () => {
    const result = await replaceSandboxFileText(buildInput());

    expect(writeRawFileMock).toHaveBeenCalledWith({
      content: "first line\nFull stack + AI engineer\nlast line",
      path: "src/components/Hero.jsx",
      sessionId: "session-test",
    });
    expect(result).toEqual({
      newText: "Full stack + AI engineer",
      oldText: "Full stack developer",
      path: "src/components/Hero.jsx",
      session: mockSession,
      startLine: 2,
    });
  });

  it("replaces exact multiline text beginning on the requested line", async () => {
    readRawFileMock.mockResolvedValueOnce({
      content: [
        "const skills = {",
        "  backend: [",
        "    {",
        '      name: "Appwrite",',
        "    },",
        "  ],",
        "};",
      ].join("\n"),
      path: "src/data/skills.jsx",
      size: 81,
    });

    await replaceSandboxFileText(
      buildInput({
        newText: [
          "    {",
          '      name: "Appwrite",',
          "    },",
          "    {",
          '      name: "PostgreSQL",',
          "    },",
        ].join("\n"),
        oldText: ["    {", '      name: "Appwrite",', "    },"].join("\n"),
        path: "src/data/skills.jsx",
        startLine: 3,
      }),
    );

    expect(writeRawFileMock).toHaveBeenCalledWith({
      content: [
        "const skills = {",
        "  backend: [",
        "    {",
        '      name: "Appwrite",',
        "    },",
        "    {",
        '      name: "PostgreSQL",',
        "    },",
        "  ],",
        "};",
      ].join("\n"),
      path: "src/data/skills.jsx",
      sessionId: "session-test",
    });
  });

  it("preserves the rest of the file and normalizes windows line endings", async () => {
    readRawFileMock.mockResolvedValueOnce({
      content: "one\r\ntwo target\r\nthree",
      path: "src/file.ts",
      size: 22,
    });

    await replaceSandboxFileText(
      buildInput({
        newText: "updated",
        oldText: "target",
        path: "src/file.ts",
        startLine: 2,
      }),
    );

    expect(writeRawFileMock).toHaveBeenCalledWith({
      content: "one\ntwo updated\nthree",
      path: "src/file.ts",
      sessionId: "session-test",
    });
  });

  it("fails when startLine is invalid", async () => {
    await expect(
      replaceSandboxFileText(buildInput({ startLine: 0 })),
    ).rejects.toThrow("invalid_line_range");
    expect(readRawFileMock).not.toHaveBeenCalled();
    expect(writeRawFileMock).not.toHaveBeenCalled();
  });

  it("fails when the line does not exist", async () => {
    await expect(
      replaceSandboxFileText(buildInput({ startLine: 99 })),
    ).rejects.toThrow("line_not_found");
    expect(writeRawFileMock).not.toHaveBeenCalled();
  });

  it("fails when oldText is empty", async () => {
    await expect(
      replaceSandboxFileText(buildInput({ oldText: "" })),
    ).rejects.toThrow("missing_old_text");
    expect(readRawFileMock).not.toHaveBeenCalled();
    expect(writeRawFileMock).not.toHaveBeenCalled();
  });

  it("returns candidate lines when oldText is missing from the target line", async () => {
    readRawFileMock.mockResolvedValueOnce({
      content: "Full stack developer\nsecond\nFull stack developer\nfourth",
      path: "src/components/Hero.jsx",
      size: 58,
    });

    await expect(
      replaceSandboxFileText(buildInput({ startLine: 2 })),
    ).rejects.toThrow(
      "line_text_mismatch: oldText found on candidate lines 1, 3",
    );
    expect(writeRawFileMock).not.toHaveBeenCalled();
  });

  it("returns the candidate start line for multiline oldText", async () => {
    readRawFileMock.mockResolvedValueOnce({
      content: "first\nalpha\nbeta\nlast",
      path: "src/file.ts",
      size: 21,
    });

    await expect(
      replaceSandboxFileText(
        buildInput({
          oldText: "alpha\nbeta",
          path: "src/file.ts",
          startLine: 1,
        }),
      ),
    ).rejects.toThrow(
      "line_text_mismatch: oldText found on candidate line 2",
    );
    expect(writeRawFileMock).not.toHaveBeenCalled();
  });

  it("reports when oldText is not found elsewhere in the file", async () => {
    await expect(
      replaceSandboxFileText(buildInput({ oldText: "missing" })),
    ).rejects.toThrow(
      "line_text_mismatch: oldText was not found elsewhere in the file",
    );
    expect(writeRawFileMock).not.toHaveBeenCalled();
  });

  it("caps candidate line numbers in mismatch failures", async () => {
    readRawFileMock.mockResolvedValueOnce({
      content: [
        ...Array.from(
          { length: REPLACE_CANDIDATE_LINE_CAP + 1 },
          () => "Full stack developer",
        ),
        "target line without the text",
      ].join("\n"),
      path: "src/components/Hero.jsx",
      size: 200,
    });

    await expect(
      replaceSandboxFileText(
        buildInput({ startLine: REPLACE_CANDIDATE_LINE_CAP + 2 }),
      ),
    ).rejects.toThrow(
      "line_text_mismatch: oldText found on candidate lines 1, 2, 3, 4, 5 and 1 more",
    );
    expect(writeRawFileMock).not.toHaveBeenCalled();
  });

  it("fails when oldText appears multiple times on the target line", async () => {
    readRawFileMock.mockResolvedValueOnce({
      content: "first\nrepeat repeat\nlast",
      path: "src/file.ts",
      size: 24,
    });

    await expect(
      replaceSandboxFileText(
        buildInput({
          oldText: "repeat",
          path: "src/file.ts",
          startLine: 2,
        }),
      ),
    ).rejects.toThrow("ambiguous_line_match");
    expect(writeRawFileMock).not.toHaveBeenCalled();
  });

  it("fails when final content exceeds the file size limit", async () => {
    await expect(
      replaceSandboxFileText(
        buildInput({
          newText: "x".repeat(MAX_SANDBOX_FILE_BYTES + 1),
        }),
      ),
    ).rejects.toThrow("file_too_large");
    expect(writeRawFileMock).not.toHaveBeenCalled();
  });
});
