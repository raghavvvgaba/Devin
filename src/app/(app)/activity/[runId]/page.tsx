import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleDot,
  Clock3,
  Code2,
  Cpu,
  ExternalLink,
  FileCode2,
  FolderSearch2,
  GitBranch,
  ListTree,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityRefreshNotice } from "~/components/activity-refresh-notice";
import { ActivityStatus } from "~/components/activity-status";
import { ActivityTraceCopyButton } from "~/components/activity-trace-copy-button";
import { AppShell } from "~/components/app-shell";
import {
  formatActivityDate,
  formatActivityDuration,
  formatActivityNumber,
} from "~/lib/activity-format";
import { buildAgentRunTraceExport } from "~/lib/activity-trace-export";
import { getAgentModelLabel } from "~/lib/agent-models";
import { cn } from "~/lib/utils";
import { getUserAgentRun } from "~/server/agent-activity";
import { getAuth } from "~/server/auth/session";

type ActivityRunPageProps = {
  params: Promise<{
    runId: string;
  }>;
};

type TraceEvent = NonNullable<
  Awaited<ReturnType<typeof getUserAgentRun>>
>["events"][number];

const eventConfig: Record<
  string,
  {
    accent: string;
    icon: typeof Cpu;
    label: string;
  }
> = {
  invalid_tool_batch: {
    accent: "text-amber-600 dark:text-amber-300",
    icon: AlertTriangle,
    label: "Invalid tool batch",
  },
  model_error: {
    accent: "text-red-600 dark:text-red-300",
    icon: X,
    label: "Model error",
  },
  model_response: {
    accent: "text-sky-600 dark:text-sky-300",
    icon: Cpu,
    label: "Model response",
  },
  persistence_error: {
    accent: "text-amber-600 dark:text-amber-300",
    icon: AlertTriangle,
    label: "Persistence warning",
  },
  recovery_exhausted: {
    accent: "text-red-600 dark:text-red-300",
    icon: AlertTriangle,
    label: "Recovery exhausted",
  },
  recovery_recovered: {
    accent: "text-emerald-600 dark:text-emerald-300",
    icon: Check,
    label: "Recovery succeeded",
  },
  run_completed: {
    accent: "text-emerald-600 dark:text-emerald-300",
    icon: Check,
    label: "Run completed",
  },
  run_failed: {
    accent: "text-red-600 dark:text-red-300",
    icon: X,
    label: "Run failed",
  },
  run_started: {
    accent: "text-[#f04f2f]",
    icon: CircleDot,
    label: "Run started",
  },
  tool_result: {
    accent: "text-violet-600 dark:text-violet-300",
    icon: Wrench,
    label: "Tool execution",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getPayload(event: TraceEvent) {
  return isRecord(event.payload) ? event.payload : {};
}

function getEventDescription(event: TraceEvent) {
  const payload = getPayload(event);

  if (event.type === "tool_result") {
    return typeof payload.recentEvent === "string"
      ? payload.recentEvent
      : event.toolName ?? "Sandbox tool";
  }

  if (event.type === "model_response") {
    const phase = event.phase === "finish" ? "Finish turn" : "Tool-selection turn";
    const textPreview =
      typeof payload.textPreview === "string" ? payload.textPreview : undefined;
    return textPreview ? `${phase} · ${textPreview}` : phase;
  }

  if (typeof payload.messagePreview === "string") {
    return payload.messagePreview;
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  if (event.type === "run_started") {
    return typeof payload.instructionPreview === "string"
      ? payload.instructionPreview
      : "The agent accepted the instruction.";
  }

  return event.status ?? event.type.replaceAll("_", " ");
}

function TraceEventRow({ event }: { event: TraceEvent }) {
  const config = eventConfig[event.type] ?? {
    accent: "text-muted-foreground",
    icon: ListTree,
    label: event.type.replaceAll("_", " "),
  };
  const Icon = config.icon;
  const payload = getPayload(event);
  const hasDetails = Object.keys(payload).length > 0;

  return (
    <article className="group relative grid grid-cols-[46px_minmax(0,1fr)] border-b border-border last:border-b-0">
      <div className="relative flex justify-center border-r border-border bg-muted/25 py-5">
        <span className="absolute bottom-0 top-0 w-px bg-border group-first:top-1/2 group-last:bottom-1/2" />
        <span className="relative z-10 flex h-7 w-7 items-center justify-center border border-border bg-card">
          <Icon className={cn("h-3.5 w-3.5", config.accent)} />
        </span>
      </div>

      <div className="min-w-0 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
                {config.label}
              </p>
              {event.step !== null ? (
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                  Step {event.step}
                </span>
              ) : null}
              {event.toolName ? (
                <code className="border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-[#f04f2f]">
                  {event.toolName}
                </code>
              ) : null}
            </div>
            <p className="mt-2 max-w-4xl break-words text-sm leading-relaxed text-muted-foreground">
              {getEventDescription(event)}
            </p>
          </div>

          <div className="shrink-0 text-left sm:text-right">
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
              {event.createdAt.toLocaleTimeString("en-US", {
                hour: "2-digit",
                hour12: false,
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>
            {event.durationMs !== null ? (
              <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                {formatActivityDuration(event.durationMs)}
              </p>
            ) : null}
          </div>
        </div>

        {event.paths.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {event.paths.map((path) => (
              <code
                className="max-w-full truncate border border-border bg-background px-2 py-1 font-mono text-[9px] text-muted-foreground"
                key={path}
                title={path}
              >
                {path}
              </code>
            ))}
          </div>
        ) : null}

        {event.totalTokens !== null ? (
          <div className="mt-4 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
            {[
              ["Input", event.promptTokens ?? 0],
              ["Output", event.completionTokens ?? 0],
              ["Reasoning", event.reasoningTokens ?? 0],
              ["Total", event.totalTokens],
            ].map(([label, value]) => (
              <div className="bg-card px-3 py-2.5" key={String(label)}>
                <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 font-mono text-xs font-semibold">
                  {formatActivityNumber(Number(value))}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {hasDetails ? (
          <details className="mt-4 border border-border bg-background">
            <summary className="cursor-pointer select-none px-3 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              Inspect event payload
            </summary>
            <pre className="max-h-[420px] overflow-auto border-t border-border p-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </details>
        ) : null}
      </div>
    </article>
  );
}

export default async function ActivityRunPage({
  params,
}: ActivityRunPageProps) {
  const { userId } = await getAuth();
  const { runId } = await params;
  const run = await getUserAgentRun(userId!, runId);

  if (!run) {
    notFound();
  }

  const filesRead = new Set<string>();
  const filesSearched = new Set<string>();
  const filesModified = new Set<string>();

  for (const event of run.events) {
    if (event.toolName === "read_file") {
      event.paths.forEach((path) => filesRead.add(path));
    } else if (
      event.toolName === "search_code" ||
      event.toolName === "glob_files" ||
      event.toolName === "list_directory"
    ) {
      event.paths.forEach((path) => filesSearched.add(path));
    } else if (
      event.toolName === "write_file" ||
      event.toolName === "replace_in_file"
    ) {
      event.paths.forEach((path) => filesModified.add(path));
    }
  }

  const fileGroups = [
    {
      icon: FileCode2,
      label: "Read",
      paths: Array.from(filesRead),
    },
    {
      icon: FolderSearch2,
      label: "Searched",
      paths: Array.from(filesSearched),
    },
    {
      icon: Code2,
      label: "Modified",
      paths: Array.from(filesModified),
    },
  ].filter((group) => group.paths.length > 0);

  return (
    <AppShell compactHeader description="" title="Run trace">
      <div className="space-y-7 pb-10">
        <section className="border-b border-border pb-7">
          <Link
            className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
            href="/activity"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Activity ledger
          </Link>

          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <ActivityStatus status={run.status} />
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  {run.mode} mode
                </span>
              </div>
              <h1 className="inlaya-display mt-4 text-4xl font-medium tracking-[-0.05em] sm:text-5xl">
                Run trace
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {run.instructionPreview ?? run.issueTitle ?? "Agent instruction"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ActivityTraceCopyButton
                trace={buildAgentRunTraceExport(run)}
              />
              <Link
                className="flex h-10 w-fit items-center gap-2 border border-border bg-card px-3 text-xs font-semibold transition-colors hover:border-foreground hover:bg-foreground hover:text-background"
                href={`/projects/${run.projectId}/issues/${run.issueNumber}`}
              >
                <GitBranch className="h-3.5 w-3.5" />
                {run.project.repoOwner}/{run.project.repoName} #{run.issueNumber}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </section>

        <ActivityRefreshNotice initialRefreshedAt={new Date().toISOString()} />

        <section className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Cpu,
              label: "Model",
              value: getAgentModelLabel(run.requestedModel),
            },
            {
              icon: Code2,
              label: "Tokens",
              value: formatActivityNumber(run.totalTokens),
            },
            {
              icon: ListTree,
              label: "Steps / events",
              value: `${run.stepsUsed} / ${run.events.length}`,
            },
            {
              icon: Clock3,
              label: "Duration",
              value: formatActivityDuration(run.durationMs),
            },
          ].map((metric) => {
            const Icon = metric.icon;
            return (
              <div className="bg-card p-4" key={metric.label}>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-3.5 w-3.5 text-[#f04f2f]" />
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em]">
                    {metric.label}
                  </p>
                </div>
                <p className="mt-3 truncate text-sm font-semibold">
                  {metric.value}
                </p>
              </div>
            );
          })}
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[#f04f2f]">
                  Execution
                </p>
                <h2 className="inlaya-display mt-1 text-3xl font-medium tracking-[-0.04em]">
                  Event timeline
                </h2>
              </div>
              <p className="font-mono text-[9px] uppercase text-muted-foreground">
                {formatActivityDate(run.startedAt)}
              </p>
            </div>

            <div className="border border-border bg-card">
              {run.events.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  This run does not have persisted trace events.
                </div>
              ) : (
                run.events.map((event) => (
                  <TraceEventRow event={event} key={event.id} />
                ))
              )}
            </div>
          </div>

          <aside className="space-y-4 lg:pt-12">
            <section className="border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Run identity
                </p>
              </div>
              <dl className="divide-y divide-border text-xs">
                {[
                  ["Run", run.id],
                  ["Provider", run.provider],
                  ["Requested", run.requestedModel],
                  ["Resolved", run.resolvedModel ?? "—"],
                  ["Started", formatActivityDate(run.startedAt)],
                ].map(([label, value]) => (
                  <div className="grid grid-cols-[76px_1fr] gap-3 px-4 py-3" key={label}>
                    <dt className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="min-w-0 break-all font-mono text-[10px]">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            {fileGroups.length > 0 ? (
              <section className="border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Repository footprint
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {fileGroups.map((group) => {
                    const Icon = group.icon;
                    return (
                      <div className="p-4" key={group.label}>
                        <p className="flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[0.12em]">
                          <Icon className="h-3.5 w-3.5 text-[#f04f2f]" />
                          {group.label} · {group.paths.length}
                        </p>
                        <div className="mt-3 space-y-1.5">
                          {group.paths.slice(0, 12).map((path) => (
                            <p
                              className="truncate font-mono text-[9px] text-muted-foreground"
                              key={path}
                              title={path}
                            >
                              {path}
                            </p>
                          ))}
                          {group.paths.length > 12 ? (
                            <p className="font-mono text-[9px] text-muted-foreground">
                              +{group.paths.length - 12} more
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </aside>
        </section>
      </div>
    </AppShell>
  );
}
