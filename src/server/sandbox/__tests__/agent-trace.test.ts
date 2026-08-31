import { describe, expect, it } from "vitest";

import {
  collectToolPaths,
  sanitizeToolArguments,
  toTracePreview,
  toToolSpanErrorType,
} from "../agent-trace";

describe("toToolSpanErrorType", () => {
  it.each([
    ["replacement_too_large", false, "replacement_too_large"],
    ["text_not_found: private source details", false, "text_not_found"],
    ["ambiguous_text_match: private source details", false, "ambiguous_text_match"],
    ["invalid_tool_arguments_json", true, "invalid_tool_arguments_json"],
    ["private validation details", true, "invalid_tool_arguments"],
    ["custom_secret_value", false, "tool_execution_failed"],
    ["https://private.test/path", false, "tool_execution_failed"],
    ["", false, "tool_execution_failed"],
  ])("normalizes %s without exporting arbitrary error text", (code, invalid, expected) => {
    expect(toToolSpanErrorType(code, invalid)).toBe(expected);
  });
});

describe("sanitizeToolArguments", () => {
  it("keeps file metadata without persisting write contents", () => {
    expect(
      sanitizeToolArguments("write_file", {
        content: "first line\nsecond line",
        path: "src/app/page.tsx",
      }),
    ).toEqual({
      content: {
        characterCount: 22,
        lineCount: 2,
      },
      path: "src/app/page.tsx",
    });
  });

  it("summarizes replacement text and redacts credential-like keys", () => {
    expect(
      sanitizeToolArguments("replace_in_file", {
        newText: "new value",
        oldText: "old value",
        path: "src/env.ts",
        token: "secret-token-value",
      }),
    ).toEqual({
      newText: {
        characterCount: 9,
        lineCount: 1,
      },
      oldText: {
        characterCount: 9,
        lineCount: 1,
      },
      path: "src/env.ts",
      token: "[REDACTED]",
    });
  });
});

describe("collectToolPaths", () => {
  it("collects and deduplicates argument, result, and touched paths", () => {
    expect(
      collectToolPaths({
        argumentsValue: {
          path: "src",
        },
        resultValue: {
          matches: [
            { path: "src/a.ts" },
            { path: "src/b.ts" },
            { path: "src/a.ts" },
          ],
          paths: ["src/c.ts"],
        },
        touchedPath: "src/a.ts",
      }),
    ).toEqual(["src", "src/a.ts", "src/b.ts", "src/c.ts"]);
  });
});

describe("toTracePreview", () => {
  it("redacts common secrets and bounds the preview", () => {
    const preview = toTracePreview(
      `Authorization: Bearer abcdefghijklmnopqrstuvwxyz ${"x".repeat(200)}`,
      60,
    );

    expect(preview).toContain("[REDACTED]");
    expect(preview.length).toBeLessThanOrEqual(63);
  });
});
