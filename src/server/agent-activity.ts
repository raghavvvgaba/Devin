import "server-only";

import { Prisma } from "../../generated/prisma";

import { db } from "~/server/db";
import type { AIUsage } from "~/server/ai/types";
import type { SandboxAgentTraceEvent } from "~/server/sandbox/agent-trace";
import { sanitizeTracePayload } from "~/server/sandbox/agent-trace";

export type ActivityRange = "7d" | "30d" | "all";

type CreateAgentRunInput = {
  chatSessionId: string;
  instructionPreview: string;
  issueNumber: number;
  issueTitle: string;
  mode: string;
  projectId: string;
  provider: string;
  requestedModel: string;
  userId: string;
};

type CompleteAgentRunInput = {
  durationMs: number;
  failureCode?: string;
  resolvedModel?: string;
  runId: string;
  status: string;
  stepsUsed: number;
  usage?: AIUsage;
};

function toJsonPayload(payload: Record<string, unknown>) {
  return sanitizeTracePayload(payload) as Prisma.InputJsonValue;
}

export async function createAgentRun(input: CreateAgentRunInput) {
  return db.agentRun.create({
    data: {
      chatSessionId: input.chatSessionId,
      instructionPreview: input.instructionPreview,
      issueNumber: input.issueNumber,
      issueTitle: input.issueTitle,
      mode: input.mode,
      projectId: input.projectId,
      provider: input.provider,
      requestedModel: input.requestedModel,
      userId: input.userId,
    },
    select: {
      id: true,
    },
  });
}

export function createAgentTraceWriter(runId: string) {
  let nextSequence = 1;
  let resolvedModel: string | undefined;
  let writeQueue: Promise<void> = Promise.resolve();

  function append(event: SandboxAgentTraceEvent) {
    const sequence = nextSequence;
    nextSequence += 1;

    if (event.model) {
      resolvedModel = event.model;
    }

    writeQueue = writeQueue
      .then(async () => {
        await db.agentRunEvent.create({
          data: {
            costUsd: event.usage?.cost,
            durationMs: event.durationMs,
            level: event.level ?? "info",
            model: event.model,
            paths: event.paths ?? [],
            payload: toJsonPayload(event.payload),
            phase: event.phase,
            promptTokens: event.usage?.promptTokens,
            completionTokens: event.usage?.completionTokens,
            reasoningTokens: event.usage?.reasoningTokens,
            runId,
            sequence,
            status: event.status,
            step: event.step,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            totalTokens: event.usage?.totalTokens,
            type: event.type,
          },
        });
      })
      .catch((error) => {
        console.error("Sandbox agent activity event persistence failed:", error);
      });
  }

  return {
    append,
    async flush() {
      await writeQueue;
    },
    getResolvedModel() {
      return resolvedModel;
    },
  };
}

export async function completeAgentRun(input: CompleteAgentRunInput) {
  await db.agentRun.update({
    data: {
      completedAt: new Date(),
      completionTokens: input.usage?.completionTokens ?? 0,
      costUsd: input.usage?.cost,
      durationMs: input.durationMs,
      failureCode: input.failureCode,
      promptTokens: input.usage?.promptTokens ?? 0,
      reasoningTokens: input.usage?.reasoningTokens,
      resolvedModel: input.resolvedModel,
      status: input.status,
      stepsUsed: input.stepsUsed,
      totalTokens: input.usage?.totalTokens ?? 0,
    },
    where: {
      id: input.runId,
    },
  });
}

export async function failAgentRun(input: {
  durationMs: number;
  failureCode: string;
  runId: string;
}) {
  await db.agentRun.update({
    data: {
      completedAt: new Date(),
      durationMs: input.durationMs,
      failureCode: input.failureCode,
      status: "failed",
    },
    where: {
      id: input.runId,
    },
  });
}

export function parseActivityRange(value: string | undefined): ActivityRange {
  return value === "7d" || value === "all" ? value : "30d";
}

function getRangeStart(range: ActivityRange) {
  if (range === "all") {
    return undefined;
  }

  const days = range === "7d" ? 7 : 30;
  const start = new Date();
  start.setDate(start.getDate() - days);
  return start;
}

export async function getUserActivityPageData(
  userId: string,
  range: ActivityRange,
) {
  const rangeStart = getRangeStart(range);
  const where = {
    userId,
    ...(rangeStart ? { startedAt: { gte: rangeStart } } : {}),
  };

  const [totals, models, statuses, recentRuns] = await Promise.all([
    db.agentRun.aggregate({
      _count: {
        _all: true,
      },
      _sum: {
        completionTokens: true,
        promptTokens: true,
        reasoningTokens: true,
        totalTokens: true,
      },
      where,
    }),
    db.agentRun.groupBy({
      _count: {
        _all: true,
      },
      by: ["requestedModel"],
      where,
    }),
    db.agentRun.groupBy({
      _count: {
        _all: true,
      },
      by: ["status"],
      where,
    }),
    db.agentRun.findMany({
      include: {
        project: {
          select: {
            repoName: true,
            repoOwner: true,
          },
        },
      },
      orderBy: {
        startedAt: "desc",
      },
      take: 50,
      where,
    }),
  ]);

  const mostUsedModel = models.sort(
    (left, right) => right._count._all - left._count._all,
  )[0];
  const completedRuns =
    statuses.find((entry) => entry.status === "completed")?._count._all ?? 0;

  return {
    recentRuns: recentRuns.map((run) => ({
      ...run,
      costUsd: run.costUsd === null ? null : Number(run.costUsd),
    })),
    summary: {
      completedRuns,
      completionTokens: totals._sum.completionTokens ?? 0,
      mostUsedModel: mostUsedModel?.requestedModel,
      promptTokens: totals._sum.promptTokens ?? 0,
      reasoningTokens: totals._sum.reasoningTokens ?? 0,
      runCount: totals._count._all,
      totalTokens: totals._sum.totalTokens ?? 0,
    },
  };
}

export async function getUserAgentRun(userId: string, runId: string) {
  const run = await db.agentRun.findFirst({
    include: {
      events: {
        orderBy: {
          sequence: "asc",
        },
      },
      project: {
        select: {
          repoName: true,
          repoOwner: true,
        },
      },
    },
    where: {
      id: runId,
      userId,
    },
  });

  if (!run) {
    return null;
  }

  return {
    ...run,
    costUsd: run.costUsd === null ? null : Number(run.costUsd),
    events: run.events.map((event) => ({
      ...event,
      costUsd: event.costUsd === null ? null : Number(event.costUsd),
    })),
  };
}
