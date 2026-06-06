import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, ExternalLink } from "lucide-react";

import { AppShell } from "~/components/app-shell";
import { IssueChatWorkspace } from "~/components/issue-chat-workspace";
import { IssueDetailsModal } from "~/components/issue-details-modal";
import { IssueSandboxStatusPanel } from "~/components/issue-sandbox-status-panel";
import { type AIChatMessage } from "~/components/ui/ai-chat";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { buildIssueChatStatusMessage } from "~/lib/issue-chat-messages";
import { getAuth } from "~/server/auth/session";
import {
  getIssueChatMessages,
  getOrCreateIssueChatSession,
} from "~/server/chat";
import { fetchProjectIssue } from "~/server/github/issues";
import { getOwnedProject } from "~/server/projects";

type IssuePageProps = {
  params: Promise<{ id: string; issueNumber: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

export default async function ProjectIssuePage({
  params,
  searchParams,
}: IssuePageProps) {
  const { userId } = await getAuth();
  const { id, issueNumber: rawIssueNumber } = await params;
  const { error, success } = await searchParams;
  const issueNumber = Number(rawIssueNumber);
  const project = await getOwnedProject(id, userId!);

  if (!project || Number.isNaN(issueNumber)) {
    notFound();
  }

  return (
    <AppShell compactHeader contentWidth="full" description="" title="Issue">
      <section>
        <div className="mb-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <Button
              asChild
              variant="outline"
              className="h-10 rounded-none border-border px-4 text-[10px] font-bold uppercase tracking-widest"
            >
              <Link href={`/projects/${project.id}`}>
                <ChevronLeft className="mr-2 h-3.5 w-3.5" />
                Back
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-10 w-10 rounded-none border-border p-0"
            >
              <a
                href={`https://github.com/${project.repoOwner}/${project.repoName}/issues/${issueNumber}`}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="sr-only">On GitHub</span>
              </a>
            </Button>
          </div>
        </div>

        <Suspense fallback={<IssueWorkspaceSkeleton issueNumber={issueNumber} />}>
          <IssueWorkspaceSection
            error={error}
            issueNumber={issueNumber}
            project={project}
            success={success}
          />
        </Suspense>
      </section>
    </AppShell>
  );
}

async function IssueWorkspaceSection({
  error,
  issueNumber,
  project,
  success,
}: {
  error?: string;
  issueNumber: number;
  project: Awaited<ReturnType<typeof getOwnedProject>>;
  success?: string;
}) {
  if (!project) {
    notFound();
  }

  const issueResult = await fetchProjectIssue(
    project.repoOwner,
    project.repoName,
    issueNumber,
  );

  if (issueResult.status === "not_found") {
    notFound();
  }

  const issueTitle =
    issueResult.status === "ok"
      ? issueResult.issue.title
      : `Issue #${issueNumber}`;

  const chatSession = await getOrCreateIssueChatSession({
    issueNumber,
    projectId: project.id,
    title: issueTitle,
    userId: project.userId,
  });
  const persistedMessages = await getIssueChatMessages(chatSession.id);
  const messages: AIChatMessage[] = [...persistedMessages];
  const statusMessage = buildIssueChatStatusMessage({ error, success });

  if (statusMessage) {
    messages.unshift(statusMessage);
  }

  const accessBlocked = issueResult.status !== "ok";
  const sandboxBaseAction = `/api/projects/${project.id}/issues/${issueNumber}/sandbox`;
  const editAction = `${sandboxBaseAction}/edit`;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold uppercase tracking-tight">
          {issueTitle}
        </h1>
        <IssueDetailsModal
          author={issueResult.status === "ok" ? issueResult.issue.author : undefined}
          body={issueResult.status === "ok" ? issueResult.issue.body : null}
          comments={issueResult.status === "ok" ? issueResult.issue.comments : undefined}
          createdAt={issueResult.status === "ok" ? issueResult.issue.createdAt : undefined}
          issueNumber={issueNumber}
          state={issueResult.status === "ok" ? issueResult.issue.state : undefined}
          title={issueTitle}
          updatedAt={issueResult.status === "ok" ? issueResult.issue.updatedAt : undefined}
        />
      </div>

      <IssueSandboxStatusPanel
        heartbeatAction={`${sandboxBaseAction}/heartbeat`}
        projectId={project.id}
        restartPreviewAction={`${sandboxBaseAction}/restart-preview`}
        sessionAction={`${sandboxBaseAction}/session`}
        startAction={`${sandboxBaseAction}/start`}
        stopAction={`${sandboxBaseAction}/stop`}
      />

      <IssueChatWorkspace
        accessBlocked={accessBlocked}
        editAction={editAction}
        initialFilePath=""
        initialInstruction=""
        initialMessages={messages}
        issueNumber={issueNumber}
        projectId={project.id}
      />
    </>
  );
}

function IssueWorkspaceSkeleton({ issueNumber }: { issueNumber: number }) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Issue #{issueNumber}
          </p>
          <Skeleton className="h-8 w-72 rounded-none" />
        </div>
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden border border-border bg-card">
        <div className="space-y-4 border-b border-border p-6">
          <Skeleton className="h-4 w-32 rounded-none" />
          <Skeleton className="h-4 w-2/3 rounded-none" />
          <Skeleton className="h-4 w-1/2 rounded-none" />
        </div>
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-24 w-full rounded-none" />
          <Skeleton className="h-24 w-full rounded-none" />
        </div>
      </div>
    </>
  );
}
