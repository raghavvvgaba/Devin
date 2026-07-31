type TraceExportEvent = {
  completionTokens: number | null;
  costUsd: number | null;
  createdAt: Date | string;
  durationMs: number | null;
  level: string;
  model: string | null;
  paths: string[];
  payload: unknown;
  phase: string | null;
  promptTokens: number | null;
  reasoningTokens: number | null;
  sequence: number;
  status: string | null;
  step: number | null;
  toolCallId: string | null;
  toolName: string | null;
  totalTokens: number | null;
  type: string;
};

type TraceExportRun = {
  completedAt: Date | string | null;
  completionTokens: number;
  costUsd: number | null;
  durationMs: number | null;
  events: TraceExportEvent[];
  failureCode: string | null;
  id: string;
  instructionPreview: string | null;
  issueNumber: number;
  issueTitle: string | null;
  mode: string;
  project: {
    repoName: string;
    repoOwner: string;
  };
  projectId: string;
  promptTokens: number;
  provider: string;
  reasoningTokens: number | null;
  requestedModel: string;
  resolvedModel: string | null;
  startedAt: Date | string;
  status: string;
  stepsUsed: number;
  totalTokens: number;
};

function toIsoString(value: Date | string | null) {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function getEventLabel(event: TraceExportEvent) {
  switch (event.type) {
    case "run_started":
      return "Sandbox agent started:";
    case "model_response":
      return "Sandbox agent model response:";
    case "tool_result":
      return "Sandbox agent tool result:";
    case "run_completed":
    case "run_failed":
      return "Sandbox agent usage:";
    default:
      return `Sandbox agent ${event.type.replaceAll("_", " ")}:`;
  }
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function buildAgentRunTraceExport(run: TraceExportRun) {
  const sections = [
    "INLAYA SANDBOX AGENT RUN TRACE",
    [
      "Run summary:",
      formatJson({
        completedAt: toIsoString(run.completedAt),
        durationMs: run.durationMs,
        failureCode: run.failureCode,
        instruction: run.instructionPreview,
        issueNumber: run.issueNumber,
        issueTitle: run.issueTitle,
        mode: run.mode,
        projectId: run.projectId,
        provider: run.provider,
        repoName: run.project.repoName,
        repoOwner: run.project.repoOwner,
        requestedModel: run.requestedModel,
        resolvedModel: run.resolvedModel,
        runId: run.id,
        startedAt: toIsoString(run.startedAt),
        status: run.status,
        stepsUsed: run.stepsUsed,
        usage: {
          completionTokens: run.completionTokens,
          costUsd: run.costUsd,
          promptTokens: run.promptTokens,
          reasoningTokens: run.reasoningTokens,
          totalTokens: run.totalTokens,
        },
      }),
    ].join("\n"),
    ...run.events.map((event) =>
      [
        getEventLabel(event),
        formatJson({
          createdAt: toIsoString(event.createdAt),
          durationMs: event.durationMs,
          level: event.level,
          model: event.model,
          paths: event.paths,
          payload: event.payload,
          phase: event.phase,
          sequence: event.sequence,
          status: event.status,
          step: event.step,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          usage:
            event.totalTokens === null
              ? null
              : {
                  completionTokens: event.completionTokens,
                  costUsd: event.costUsd,
                  promptTokens: event.promptTokens,
                  reasoningTokens: event.reasoningTokens,
                  totalTokens: event.totalTokens,
                },
          type: event.type,
        }),
      ].join("\n"),
    ),
  ];

  return `${sections.join("\n\n")}\n`;
}
