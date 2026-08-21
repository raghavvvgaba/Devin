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
  replaceSandboxAgentTool,
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
  it("rejects missing required arguments before contacting E2B", async () => {
    await expect(
      replaceSandboxAgentTool.execute(
        {
          oldText: "Full stack developer",
          path: "src/components/Hero.jsx",
        } as never,
        { sessionId: "session-test" },
      ),
    ).rejects.toThrow();

    expect(readRawFileMock).not.toHaveBeenCalled();
    expect(writeRawFileMock).not.toHaveBeenCalled();
  });

  it("replaces one unique exact match and writes updated content", async () => {
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

  it("replaces one unique exact multiline match", async () => {
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
      }),
    );

    expect(writeRawFileMock).toHaveBeenCalledWith({
      content: "one\ntwo updated\nthree",
      path: "src/file.ts",
      sessionId: "session-test",
    });
  });

  it("fails when oldText is empty", async () => {
    await expect(
      replaceSandboxFileText(buildInput({ oldText: "" })),
    ).rejects.toThrow("missing_old_text");
    expect(readRawFileMock).not.toHaveBeenCalled();
    expect(writeRawFileMock).not.toHaveBeenCalled();
  });

  it("rejects multiple exact matches and returns their line numbers", async () => {
    readRawFileMock.mockResolvedValueOnce({
      content: "Full stack developer\nsecond\nFull stack developer\nfourth",
      path: "src/components/Hero.jsx",
      size: 58,
    });

    await expect(
      replaceSandboxFileText(buildInput()),
    ).rejects.toThrow(
      "ambiguous_text_match: oldText matched 2 times on lines 1, 3 Provide more surrounding text so oldText matches exactly once.",
    );
    expect(writeRawFileMock).not.toHaveBeenCalled();
  });

  it("finds a unique multiline match without a supplied line number", async () => {
    readRawFileMock.mockResolvedValueOnce({
      content: "first\nalpha\nbeta\nlast",
      path: "src/file.ts",
      size: 21,
    });

    const result = await replaceSandboxFileText(
      buildInput({
        newText: "updated",
        oldText: "alpha\nbeta",
        path: "src/file.ts",
      }),
    );

    expect(result.startLine).toBe(2);
    expect(writeRawFileMock).toHaveBeenCalledWith({
      content: "first\nupdated\nlast",
      path: "src/file.ts",
      sessionId: "session-test",
    });
  });

  it("reports when oldText has no exact match", async () => {
    await expect(
      replaceSandboxFileText(buildInput({ oldText: "missing" })),
    ).rejects.toThrow(
      "text_not_found: oldText was not found exactly in the current file. Re-read the relevant lines before retrying.",
    );
    expect(writeRawFileMock).not.toHaveBeenCalled();
  });

  it("caps line numbers in ambiguous-match failures", async () => {
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
      replaceSandboxFileText(buildInput()),
    ).rejects.toThrow(
      "ambiguous_text_match: oldText matched 6 times on lines 1, 2, 3, 4, 5 and 1 more Provide more surrounding text so oldText matches exactly once.",
    );
    expect(writeRawFileMock).not.toHaveBeenCalled();
  });

  it("fails when oldText appears multiple times on one line", async () => {
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
        }),
      ),
    ).rejects.toThrow(
      "ambiguous_text_match: oldText matched 2 times on line 2",
    );
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
