import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";

import { AppShell } from "~/components/app-shell";
import { IssueChatWorkspace } from "~/components/issue-chat-workspace";
import { IssueDetailsModal } from "~/components/issue-details-modal";
import { IssuePreviewPane } from "~/components/issue-preview-pane";
import { IssueWorkspaceLayout } from "~/components/issue-workspace-layout";
import { Button } from "~/components/ui/button";
import { env } from "~/env";
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
  const agentAction = `${sandboxBaseAction}/agent`;
  const clearChatAction = `/api/projects/${project.id}/issues/${issueNumber}/chat`;
  const submitAction = `${sandboxBaseAction}/submit`;
  const modelPickerEnabled = env.AI_PROVIDER === "openrouter";

  return (
    <IssueWorkspaceLayout
      sidebar={
        <>
          {/* Header */}
          <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-[#171713]/15 bg-[#f3efe5]/70 px-3 dark:border-[#fffaf0]/15 dark:bg-[#11110f]/70">
            <span className="absolute bottom-[-1px] left-3 h-px w-12 bg-[#f04f2f]" />
            <Button
              asChild
              variant="ghost"
              className="h-8 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6d675d] hover:bg-[#171713]/5 hover:text-[#171713] dark:text-[#aaa69d] dark:hover:bg-white/5 dark:hover:text-[#fffaf0]"
            >
              <Link href={`/projects/${project.id}`}>
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                Back
              </Link>
            </Button>
            <div className="flex items-center gap-1">
              <IssueDetailsModal
                author={issueResult.status === "ok" ? issueResult.issue.author : undefined}
                body={issueResult.status === "ok" ? issueResult.issue.body : null}
                comments={issueResult.status === "ok" ? issueResult.issue.comments : undefined}
                createdAt={issueResult.status === "ok" ? issueResult.issue.createdAt : undefined}
                githubUrl={`https://github.com/${project.repoOwner}/${project.repoName}/issues/${issueNumber}`}
                issueNumber={issueNumber}
                state={issueResult.status === "ok" ? issueResult.issue.state : undefined}
                title={issueTitle}
                updatedAt={issueResult.status === "ok" ? issueResult.issue.updatedAt : undefined}
              />
            </div>
          </header>

          {/* Chat / Body */}
          <div className="flex min-h-0 flex-1 flex-col">
            <IssueChatWorkspace
              accessBlocked={accessBlocked}
              agentAction={agentAction}
              clearChatAction={clearChatAction}
              initialInstruction=""
              initialMessages={messages}
              issueNumber={issueNumber}
              issueTitle={issueTitle}
              modelPickerEnabled={modelPickerEnabled}
              projectId={project.id}
              sessionAction={`${sandboxBaseAction}/session`}
              submitAction={submitAction}
            />
          </div>
        </>
      }
    >
      {/* Right Pane - Preview */}
      <IssuePreviewPane
        checkPreviewAction={`${sandboxBaseAction}/check-preview`}
        heartbeatAction={`${sandboxBaseAction}/heartbeat`}
        projectId={project.id}
        restartPreviewAction={`${sandboxBaseAction}/restart-preview`}
        sessionAction={`${sandboxBaseAction}/session`}
        startAction={`${sandboxBaseAction}/start`}
        stopAction={`${sandboxBaseAction}/stop`}
      />
    </IssueWorkspaceLayout>
  );
}
