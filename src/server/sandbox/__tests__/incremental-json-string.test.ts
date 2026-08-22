import { describe, expect, it } from "vitest";

import {
  extractPartialJsonStringField,
  IncrementalJsonStringField,
} from "../incremental-json-string";

describe("incremental structured response parsing", () => {
  it("finds message regardless of property order", () => {
    expect(
      extractPartialJsonStringField(
        '{"status":"completed","message":"Ready',
        "message",
      ),
    ).toBe("Ready");
    expect(
      extractPartialJsonStringField(
        '{"clarificationQuestion":"Need message: details","message":"Next',
        "message",
      ),
    ).toBe("Next");
  });

  it("emits only stable decoded text across escapes and Unicode boundaries", () => {
    const field = new IncrementalJsonStringField("message");

    expect(field.push('{"status":"completed","message":"Hello\\')).toBe(
      "Hello",
    );
    expect(field.push('nworld \\uD83D')).toBe("\nworld ");
    expect(field.push('\\uDE80 and ')).toBe("🚀 and ");

    const rocket = "🚀";
    const rawUnicodeField = new IncrementalJsonStringField("message");
    expect(
      rawUnicodeField.push(`{"message":"go ${rocket.slice(0, 1)}`),
    ).toBe("go ");
    expect(rawUnicodeField.push(`${rocket.slice(1)} now"}`)).toBe("🚀 now");
  });

  it("rejects an excessively large streamed response", () => {
    const field = new IncrementalJsonStringField("message");
    expect(() => field.push(`{"message":"${"a".repeat(20_001)}`)).toThrow(
      "safe size limit",
    );
  });
});
