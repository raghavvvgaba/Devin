import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";

import { AppShell } from "~/components/app-shell";
import { IssueChatWorkspace } from "~/components/issue-chat-workspace";
import { IssueDetailsModal } from "~/components/issue-details-modal";
import { IssueSandboxStatusPanel } from "~/components/issue-sandbox-status-panel";
import { Button } from "~/components/ui/button";
import { getAuth } from "~/server/auth/session";
import { getIssueWorkspacePageData } from "~/server/projects";

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
  const issueWorkspaceData = await getIssueWorkspacePageData(
    userId!,
    id,
    issueNumber,
    { error, success },
  );

  if (issueWorkspaceData.notFound) {
    notFound();
  }

  const {
    accessBlocked,
    issueResult,
    issueTitle,
    messages,
    project,
  } = issueWorkspaceData;
  const sandboxBaseAction = `/api/projects/${project.id}/issues/${issueNumber}/sandbox`;
  const editAction = `${sandboxBaseAction}/edit`;

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
      </section>
    </AppShell>
  );
}
