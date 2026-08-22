import { describe, expect, it } from "vitest";

import { formatSseEvent } from "../agent-stream";

describe("formatSseEvent", () => {
  it("formats named SSE events with JSON data", () => {
    expect(
      formatSseEvent({
        message: "Searching the codebase...",
        type: "progress",
      }),
    ).toBe(
      'event: progress\ndata: {"message":"Searching the codebase...","type":"progress"}\n\n',
    );
  });

  it("formats final response deltas without exposing other result fields", () => {
    expect(
      formatSseEvent({
        delta: "Updated the page.",
        type: "final_delta",
      }),
    ).toBe(
      'event: final_delta\ndata: {"delta":"Updated the page.","type":"final_delta"}\n\n',
    );
  });
});
