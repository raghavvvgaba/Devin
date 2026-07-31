import { describe, expect, it } from "vitest";

import { buildAgentRunTraceExport } from "../activity-trace-export";

describe("buildAgentRunTraceExport", () => {
  it("exports the run summary and ordered trace payloads", () => {
    const trace = buildAgentRunTraceExport({
      completedAt: new Date("2026-07-31T10:00:05.000Z"),
      completionTokens: 20,
      costUsd: 0.01,
      durationMs: 5_000,
      events: [
        {
          completionTokens: null,
          costUsd: null,
          createdAt: new Date("2026-07-31T10:00:00.000Z"),
          durationMs: null,
          level: "info",
          model: null,
          paths: [],
          payload: {
            instructionPreview: "Inspect the failing agent run.",
          },
          phase: null,
          promptTokens: null,
          reasoningTokens: null,
          sequence: 1,
          status: "running",
          step: null,
          toolCallId: null,
          toolName: null,
          totalTokens: null,
          type: "run_started",
        },
        {
          completionTokens: null,
          costUsd: null,
          createdAt: new Date("2026-07-31T10:00:02.000Z"),
          durationMs: 100,
          level: "warn",
          model: null,
          paths: ["src/server/agent.ts"],
          payload: {
            recentEvent: "The tool failed.",
          },
          phase: null,
          promptTokens: null,
          reasoningTokens: null,
          sequence: 2,
          status: "tool_failure",
          step: 1,
          toolCallId: "tool-1",
          toolName: "read_file",
          totalTokens: null,
          type: "tool_result",
        },
      ],
      failureCode: "tool_retry_exhausted",
      id: "run-1",
      instructionPreview: "Inspect the failing agent run.",
      issueNumber: 42,
      issueTitle: "Agent fails to edit",
      mode: "build",
      project: {
        repoName: "devin",
        repoOwner: "inlaya",
      },
      projectId: "project-1",
      promptTokens: 100,
      provider: "openrouter",
      reasoningTokens: 5,
      requestedModel: "deepseek-v4-flash",
      resolvedModel: "deepseek/deepseek-v4-flash",
      startedAt: new Date("2026-07-31T10:00:00.000Z"),
      status: "failed",
      stepsUsed: 2,
      totalTokens: 120,
    });

    expect(trace).toContain("INLAYA SANDBOX AGENT RUN TRACE");
    expect(trace).toContain("Sandbox agent started:");
    expect(trace).toContain("Sandbox agent tool result:");
    expect(trace).toContain('"toolName": "read_file"');
    expect(trace).toContain('"failureCode": "tool_retry_exhausted"');
    expect(trace).toContain('"totalTokens": 120');
  });
});
