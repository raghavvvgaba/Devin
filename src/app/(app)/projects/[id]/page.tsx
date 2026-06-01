import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  Activity,
  ChevronLeft,
  Clock,
  ExternalLink,
  Github,
  MessageSquare,
  ShieldAlert,
  Terminal,
} from "lucide-react";

import { AppShell } from "~/components/app-shell";
import { IssueSandboxStatusPanel } from "~/components/issue-sandbox-status-panel";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { env } from "~/env";
import { getAuth } from "~/server/auth/session";
import { fetchProjectOpenIssues } from "~/server/github/issues";
import { getOwnedProject } from "~/server/projects";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

function formatProjectDate(value: Date) {
  return value.toLocaleString("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).toUpperCase();
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { userId } = await getAuth();
  const { id } = await params;
  const project = await getOwnedProject(id, userId!);

  if (!project) {
    notFound();
  }

  return (
    <AppShell compactHeader description="" title="Project">
      <div className="space-y-7">
        <section className="space-y-4 border-b border-border pb-5">
          <div className="flex items-start justify-between gap-4">
            <Button
              asChild
              variant="outline"
              className="h-10 rounded-none border-border px-4 text-[10px] font-bold uppercase tracking-widest"
            >
              <Link href="/dashboard">
                <ChevronLeft className="mr-2 h-3.5 w-3.5" />
                Return to Dashboard
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-10 w-10 rounded-none border-border p-0"
            >
              <a
                href={`https://github.com/${project.repoOwner}/${project.repoName}`}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="sr-only">Open Repository</span>
              </a>
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Github className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-bold uppercase tracking-tight">
                {project.repoOwner}/{project.repoName}
              </h1>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Indexed On {formatProjectDate(project.createdAt)}
            </p>
          </div>
        </section>

        <Suspense fallback={<ProjectIssuesSectionSkeleton />}>
          <ProjectIssuesSection
            projectId={project.id}
            repoName={project.repoName}
            repoOwner={project.repoOwner}
          />
        </Suspense>
      </div>
    </AppShell>
  );
}

async function ProjectIssuesSection({
  projectId,
  repoName,
  repoOwner,
}: {
  projectId: string;
  repoName: string;
  repoOwner: string;
}) {
  const issuesResult = await fetchProjectOpenIssues(repoOwner, repoName);
  const sandboxBaseAction = `/api/projects/${projectId}/sandbox`;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-5">
        <div>
          <h2 className="text-lg font-bold uppercase tracking-tight">
            Repository Issues
          </h2>
        </div>
      </div>

      {issuesResult.status === "missing_access" ? (
        <Alert
          variant="destructive"
          className="rounded-none border-amber-500/20 bg-amber-500/10 text-amber-500"
        >
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          <AlertTitle className="text-[10px] font-bold uppercase tracking-widest">
            Access Required
          </AlertTitle>
          <AlertDescription className="mt-4 space-y-4">
            <p className="text-xs font-medium uppercase leading-relaxed">
              GitHub App installation missing or revoked for this repository.
            </p>
            <Button
              asChild
              className="bg-amber-500 text-amber-950 font-bold uppercase text-[10px] tracking-widest h-10 rounded-none hover:bg-amber-400"
            >
              <a href={env.GITHUB_APP_INSTALL_URL} rel="noreferrer" target="_blank">
                Grant Resource Access
              </a>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {issuesResult.status === "error" ? (
        <Alert
          variant="destructive"
          className="rounded-none border-destructive/20 bg-destructive/10"
        >
          <ShieldAlert className="h-4 w-4 text-destructive" />
          <AlertTitle className="text-[10px] font-bold uppercase tracking-widest text-destructive">
            API Sync Failure
          </AlertTitle>
          <AlertDescription className="mt-2 text-xs font-medium uppercase leading-relaxed text-destructive">
            GitHub API responded with an error. Metadata is preserved, but the issue feed
            is unavailable.
          </AlertDescription>
        </Alert>
      ) : null}

      {issuesResult.status === "ok" && issuesResult.issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center border border-dashed border-border bg-muted/10 py-16 text-center">
          <Terminal className="mb-4 h-8 w-8 text-muted-foreground/30" />
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Clean Exit: 0 Issues
          </p>
          <p className="mt-2 max-w-[240px] text-[10px] uppercase text-muted-foreground">
            No open issues were detected for this repository in the current session.
          </p>
        </div>
      ) : null}

      <IssueSandboxStatusPanel
        heartbeatAction={`${sandboxBaseAction}/heartbeat`}
        issueNumber={0}
        projectId={projectId}
        restartPreviewAction={`${sandboxBaseAction}/restart-preview`}
        sessionAction={`${sandboxBaseAction}/session`}
        startAction={`${sandboxBaseAction}/start`}
        stopAction={`${sandboxBaseAction}/stop`}
      />

      {issuesResult.status === "ok" && issuesResult.issues.length > 0 ? (
        <div className="grid gap-px border border-border bg-border">
          {issuesResult.issues.map((issue) => (
            <div
              className="group/issue relative flex flex-col gap-4 bg-card p-6 transition-[background-color,box-shadow,transform] duration-200 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-emerald-500 before:opacity-0 before:transition-opacity hover:-translate-y-0.5 hover:bg-muted/40 hover:shadow-[0_14px_45px_rgba(0,0,0,0.22)] hover:before:opacity-100 md:flex-row md:items-start md:justify-between"
              key={issue.id}
            >
              <Link
                className="group flex-1 space-y-4"
                href={`/projects/${projectId}/issues/${issue.number}`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/10 rounded-none text-[10px] font-bold uppercase tracking-widest">
                    OPEN
                  </Badge>
                </div>
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-tight transition-colors group-hover:text-primary group-hover/issue:text-primary">
                    {issue.title}
                  </h4>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 transition-colors group-hover/issue:text-muted-foreground/90">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors group-hover/issue:text-muted-foreground/90">
                      <Activity className="h-3 w-3" />
                      {issue.author}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors group-hover/issue:text-muted-foreground/90">
                      <MessageSquare className="h-3 w-3" />
                      {issue.comments} REPLIES
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors group-hover/issue:text-muted-foreground/90">
                      <Clock className="h-3 w-3" />
                      UPDATED {new Date(issue.updatedAt).toLocaleDateString().toUpperCase()}
                    </div>
                  </div>
                </div>
              </Link>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  className="h-10 rounded-none px-4 text-[10px] font-bold uppercase tracking-widest transition-transform group-hover/issue:-translate-y-px"
                >
                  <Link href={`/projects/${projectId}/issues/${issue.number}`}>
                    Open Issue Workspace
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="rounded-none font-bold uppercase text-[10px] tracking-widest h-10 px-4"
                >
                  <a href={issue.url} rel="noreferrer" target="_blank">
                    GitHub
                    <ExternalLink className="ml-2 h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ProjectIssuesSectionSkeleton() {
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-5">
        <Skeleton className="h-6 w-40 rounded-none" />
      </div>
      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            className="space-y-4 border border-border bg-card p-6"
            key={`project-issues-skeleton-${index}`}
          >
            <Skeleton className="h-4 w-16 rounded-none" />
            <Skeleton className="h-5 w-2/3 rounded-none" />
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-4 w-24 rounded-none" />
              <Skeleton className="h-4 w-24 rounded-none" />
              <Skeleton className="h-4 w-28 rounded-none" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
