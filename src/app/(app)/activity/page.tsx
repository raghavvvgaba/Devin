import {
  Activity,
  ArrowRight,
  Braces,
  CheckCircle2,
  Cpu,
  GitBranch,
} from "lucide-react";
import Link from "next/link";

import { ActivityRefreshNotice } from "~/components/activity-refresh-notice";
import { ActivityStatus } from "~/components/activity-status";
import { AppShell } from "~/components/app-shell";
import {
  formatActivityDate,
  formatActivityDuration,
  formatActivityNumber,
} from "~/lib/activity-format";
import { getAgentModelLabel } from "~/lib/agent-models";
import { cn } from "~/lib/utils";
import {
  getUserActivityPageData,
  parseActivityRange,
  type ActivityRange,
} from "~/server/agent-activity";
import { getAuth } from "~/server/auth/session";

type ActivityPageProps = {
  searchParams: Promise<{
    range?: string;
  }>;
};

const rangeOptions: Array<{ label: string; value: ActivityRange }> = [
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "All time", value: "all" },
];

export default async function ActivityPage({
  searchParams,
}: ActivityPageProps) {
  const { userId } = await getAuth();
  const params = await searchParams;
  const range = parseActivityRange(params.range);
  const { recentRuns, summary } = await getUserActivityPageData(userId!, range);
  const completionRate =
    summary.runCount === 0
      ? 0
      : Math.round((summary.completedRuns / summary.runCount) * 100);

  const metrics = [
    {
      detail: `${completionRate}% completed`,
      icon: Activity,
      label: "Agent runs",
      value: formatActivityNumber(summary.runCount),
    },
    {
      detail: `${formatActivityNumber(summary.promptTokens)} input · ${formatActivityNumber(summary.completionTokens)} output`,
      icon: Braces,
      label: "Total tokens",
      value: formatActivityNumber(summary.totalTokens),
    },
    {
      detail: `${formatActivityNumber(summary.reasoningTokens)} reasoning tokens`,
      icon: CheckCircle2,
      label: "Completed",
      value: formatActivityNumber(summary.completedRuns),
    },
    {
      detail: summary.mostUsedModel
        ? getAgentModelLabel(summary.mostUsedModel)
        : "No model activity yet",
      icon: Cpu,
      label: "Most used model",
      value: summary.mostUsedModel ? "Primary" : "—",
    },
  ];

  return (
    <AppShell compactHeader description="" title="Activity">
      <div className="space-y-8 pb-10">
        <section className="relative overflow-hidden border-b border-border pb-7">
          <div className="absolute right-0 top-0 hidden font-mono text-[92px] font-bold leading-none text-foreground/[0.035] lg:block">
            TRACE
          </div>
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-3 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f04f2f]">
                <span className="h-px w-7 bg-[#f04f2f]" />
                Model ledger
              </p>
              <h1 className="inlaya-display text-5xl font-medium tracking-[-0.055em] sm:text-6xl">
                Activity
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Every agent run, model turn, tool call, and file operation in
                one inspectable history.
              </p>
            </div>

            <nav
              aria-label="Activity date range"
              className="flex w-fit border border-border bg-card p-1"
            >
              {rangeOptions.map((option) => (
                <Link
                  className={cn(
                    "px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors",
                    range === option.value
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  href={`/activity?range=${option.value}`}
                  key={option.value}
                >
                  {option.label}
                </Link>
              ))}
            </nav>
          </div>
        </section>

        <ActivityRefreshNotice initialRefreshedAt={new Date().toISOString()} />

        <section className="grid border-l border-t border-border sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric, index) => {
            const Icon = metric.icon;

            return (
              <article
                className="relative min-h-[164px] border-b border-r border-border bg-card p-5"
                key={metric.label}
              >
                <div className="flex items-start justify-between">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {metric.label}
                  </p>
                  <Icon className="h-4 w-4 text-[#f04f2f]" />
                </div>
                <p className="inlaya-display mt-7 text-4xl font-medium tracking-[-0.05em]">
                  {metric.value}
                </p>
                <p className="mt-2 truncate text-xs text-muted-foreground">
                  {metric.detail}
                </p>
                <span className="absolute bottom-2 right-3 font-mono text-[9px] text-muted-foreground/40">
                  0{index + 1}
                </span>
              </article>
            );
          })}
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Run history
              </p>
              <h2 className="inlaya-display mt-1 text-3xl font-medium tracking-[-0.04em]">
                Recent traces
              </h2>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Latest {recentRuns.length}
            </p>
          </div>

          {recentRuns.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center border border-dashed border-border bg-card/70 px-6 text-center">
              <Activity className="h-6 w-6 text-[#f04f2f]" />
              <h3 className="inlaya-display mt-4 text-2xl font-medium">
                No activity in this period
              </h3>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Run the agent from an issue workspace and its complete trace
                will appear here.
              </p>
              <Link
                className="mt-5 text-xs font-semibold underline decoration-[#f04f2f] underline-offset-4"
                href="/projects"
              >
                Open projects
              </Link>
            </div>
          ) : (
            <div className="border border-border bg-card">
              <div className="hidden grid-cols-[minmax(240px,1fr)_140px_120px_110px_44px] border-b border-border bg-muted/50 px-4 py-3 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground md:grid">
                <span>Run</span>
                <span>Model</span>
                <span>Usage</span>
                <span>Status</span>
                <span />
              </div>

              {recentRuns.map((run) => (
                <Link
                  className="group grid gap-4 border-b border-border p-4 transition-colors last:border-b-0 hover:bg-muted/45 md:grid-cols-[minmax(240px,1fr)_140px_120px_110px_44px] md:items-center"
                  href={`/activity/${run.id}`}
                  key={run.id}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-3.5 w-3.5 shrink-0 text-[#f04f2f]" />
                      <p className="truncate text-sm font-semibold">
                        {run.project.repoOwner}/{run.project.repoName}
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · #{run.issueNumber}
                        </span>
                      </p>
                    </div>
                    <p className="mt-1.5 truncate pl-5.5 text-xs text-muted-foreground">
                      {run.instructionPreview ?? run.issueTitle ?? "Agent run"}
                    </p>
                    <p className="mt-2 pl-5.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground/70">
                      {formatActivityDate(run.startedAt)} ·{" "}
                      {formatActivityDuration(run.durationMs)} · {run.mode}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium">
                      {getAgentModelLabel(run.requestedModel)}
                    </p>
                    <p className="mt-1 font-mono text-[9px] uppercase text-muted-foreground">
                      {run.provider}
                    </p>
                  </div>

                  <div>
                    <p className="font-mono text-xs font-semibold">
                      {formatActivityNumber(run.totalTokens)}
                    </p>
                    <p className="mt-1 font-mono text-[9px] uppercase text-muted-foreground">
                      {run.stepsUsed} steps
                    </p>
                  </div>

                  <ActivityStatus status={run.status} />

                  <div className="hidden h-9 w-9 items-center justify-center border border-border text-muted-foreground transition-colors group-hover:border-foreground group-hover:bg-foreground group-hover:text-background md:flex">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
