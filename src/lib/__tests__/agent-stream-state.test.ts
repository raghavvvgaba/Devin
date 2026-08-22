import { describe, expect, it } from "vitest";

import {
  appendFinalMessageDelta,
  removeTransientAgentMessages,
  streamingFinalMessageId,
  workingMessageId,
} from "../agent-stream-state";

describe("agent final response stream state", () => {
  const userMessage = {
    body: "Update the page",
    id: "user-1",
    role: "user" as const,
  };

  it("replaces working progress and appends final deltas", () => {
    const first = appendFinalMessageDelta(
      [
        userMessage,
        {
          body: "Finishing up...",
          id: workingMessageId,
          isThinking: true,
          role: "assistant",
        },
      ],
      "Updated",
    );
    const second = appendFinalMessageDelta(first, " the page.");

    expect(second).toEqual([
      userMessage,
      {
        body: "Updated the page.",
        id: streamingFinalMessageId,
        role: "assistant",
        tone: "default",
      },
    ]);
  });

  it("removes both progress and an unvalidated partial response", () => {
    expect(
      removeTransientAgentMessages([
        userMessage,
        {
          body: "Working",
          id: workingMessageId,
          role: "assistant" as const,
        },
        {
          body: "Partially streamed",
          id: streamingFinalMessageId,
          role: "assistant" as const,
        },
      ]),
    ).toEqual([userMessage]);
  });
});
