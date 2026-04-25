import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, ExternalLink } from "lucide-react";

import { AppShell } from "~/components/app-shell";
import { IssueChatWorkspace } from "~/components/issue-chat-workspace";
import { IssueDetailsModal } from "~/components/issue-details-modal";
import { type AIChatMessage } from "~/components/ui/ai-chat";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { getAuth } from "~/server/auth/session";
import { buildIssueChatDiffPreview } from "~/lib/issue-chat-diff";
import { fetchProjectIssue } from "~/server/github/issues";
import { readPendingProjectEdit } from "~/server/github/pending-edit-session";
import { readPostCommitResult } from "~/server/github/post-commit-session";
import { readPullRequestResult } from "~/server/github/pull-request-session";
import { getOwnedProject } from "~/server/projects";

type IssuePageProps = {
  params: Promise<{ id: string; issueNumber: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

function getStatusMessage(
  error: string | undefined,
  success: string | undefined,
): AIChatMessage | null {
  if (success) {
    const successCopy: Record<string, Pick<AIChatMessage, "body" | "title" | "tone">> = {
      edit_prepared: {
        title: "Draft prepared",
        body: "The chat workspace has a staged edit ready. Review the summary below, then move to branch + commit when it looks right.",
        tone: "success",
      },
      edit_cleared: {
        title: "Draft cleared",
        body: "The staged edit was removed from this issue thread. You can prepare a fresh change whenever you're ready.",
        tone: "warning",
      },
      commit_created: {
        title: "Commit recorded",
        body: "The branch and commit are live on GitHub. The next step is opening the pull request from this same workspace.",
        tone: "success",
      },
      pr_created: {
        title: "Pull request opened",
        body: "The issue workflow made it all the way to a live PR. You can open it from the message thread below.",
        tone: "success",
      },
      pr_already_exists: {
        title: "Pull request already exists",
        body: "This branch already has an open PR, so the workspace is now showing that existing review thread instead of creating another one.",
        tone: "warning",
      },
    };

    const match = successCopy[success];

    if (match) {
      return {
        id: `success-${success}`,
        role: "system",
        ...match,
      };
    }
  }

  if (error) {
    const errorCopy: Record<string, Pick<AIChatMessage, "body" | "title" | "tone">> = {
      missing_file_path: {
        title: "File path missing",
        body: "Add the repository file path in the file section before asking Devin to prepare the edit.",
        tone: "error",
      },
      missing_instruction: {
        title: "Instruction missing",
        body: "The composer needs an instruction before it can prepare the change for this issue.",
        tone: "error",
      },
      file_not_found: {
        title: "File not found",
        body: "That file path does not exist in this repository. Try an exact path from GitHub and prepare again.",
        tone: "error",
      },
      unsupported_file: {
        title: "Unsupported file",
        body: "This MVP can only prepare text-based file changes right now. Pick a plain text source file and try again.",
        tone: "error",
      },
      edit_access_missing: {
        title: "Repository access missing",
        body: "GitHub access for this repository is missing or expired, so the edit cannot be prepared from this workspace yet.",
        tone: "error",
      },
      issue_unavailable: {
        title: "Issue unavailable",
        body: "The issue details could not be loaded from GitHub right now, so the workspace is paused until that recovers.",
        tone: "error",
      },
      edit_ai_unavailable: {
        title: "Edit model unavailable",
        body: "The edit preparation service is not configured right now, so the chat can show the workflow but cannot stage a new change yet.",
        tone: "error",
      },
      edit_no_changes: {
        title: "No change generated",
        body: "The prepared result matched the current file, so there was nothing new to stage. Tighten the instruction and try again.",
        tone: "warning",
      },
      edit_invalid_response: {
        title: "Invalid edit response",
        body: "The generated edit came back in an unusable format. Try the request again with a simpler instruction.",
        tone: "error",
      },
      edit_generation_failed: {
        title: "Edit generation failed",
        body: "The model failed while preparing the change. The workspace is still intact, and you can retry from the composer.",
        tone: "error",
      },
      edit_prepare_failed: {
        title: "Edit preparation failed",
        body: "The edit could not be staged for this issue. Retry once, and if it persists we can narrow the target file further.",
        tone: "error",
      },
      pending_edit_missing: {
        title: "Draft missing",
        body: "There is no staged edit attached to this issue yet, so a commit cannot be created. Prepare the edit first.",
        tone: "error",
      },
      stale_pending_edit: {
        title: "Draft belongs to another issue",
        body: "A staged edit exists, but it belongs to a different issue thread. Clear it or prepare a new one here.",
        tone: "warning",
      },
      commit_access_missing: {
        title: "Commit blocked by access",
        body: "GitHub would not accept the branch + commit request for this repository. Check app access on GitHub, then retry.",
        tone: "error",
      },
      commit_branch_conflict: {
        title: "Branch conflict",
        body: "GitHub could not create or reuse the issue branch. Check whether the branch name is blocked or in an unusual state, then retry.",
        tone: "error",
      },
      commit_failed: {
        title: "Commit failed",
        body: "The staged change was ready, but GitHub rejected the commit step. The server log now includes the GitHub rejection message.",
        tone: "error",
      },
      commit_file_conflict: {
        title: "File changed on branch",
        body: "The issue branch changed while this commit was being written. Prepare the edit again so it can use the newest branch file.",
        tone: "error",
      },
      post_commit_missing: {
        title: "Nothing to open as PR yet",
        body: "This issue does not have a recorded branch + commit result in session, so the pull request step has nothing to use.",
        tone: "error",
      },
      pr_access_missing: {
        title: "Pull request blocked by access",
        body: "GitHub app access is missing for this repository, so the PR could not be opened from the issue workspace.",
        tone: "error",
      },
      pr_create_failed: {
        title: "Pull request failed",
        body: "The branch exists, but GitHub would not create the pull request right now. Retry from this same issue thread.",
        tone: "error",
      },
    };

    const match = errorCopy[error];

    if (match) {
      return {
        id: `error-${error}`,
        role: "system",
        ...match,
      };
    }
  }

  return null;
}

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
    <AppShell compactHeader contentWidth="full" description="" fullHeight title="Issue">
      <section className="flex min-h-0 flex-1 flex-col">
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

  const [pendingEdit, postCommit, pullRequest] = await Promise.all([
    readPendingProjectEdit(project.id, issueNumber),
    readPostCommitResult(project.id, issueNumber),
    readPullRequestResult(project.id, issueNumber),
  ]);

  const messages: AIChatMessage[] = [];
  const statusMessage = getStatusMessage(error, success);

  if (statusMessage) {
    messages.push(statusMessage);
  }

  if (pendingEdit) {
    messages.push({
      body: pendingEdit.userInstruction,
      id: "pending-edit-user",
      meta: `Issue #${issueNumber} • ${pendingEdit.filePath}`,
      role: "user",
      title: "You",
    });
    messages.push({
      body: pendingEdit.summary,
      diff: buildIssueChatDiffPreview(
        pendingEdit.filePath,
        pendingEdit.summary,
        pendingEdit.originalContent,
        pendingEdit.updatedContent,
      ),
      id: "pending-edit",
      kind: "diff",
      meta: `Prepared with ${pendingEdit.model}`,
      role: "assistant",
      title: `Draft ready for ${pendingEdit.filePath}`,
      tone: "success",
    });
  }

  if (postCommit) {
    messages.push({
      id: "post-commit",
      role: "assistant",
      title: "Branch + commit created",
      body: `The staged change is now on branch ${postCommit.branchName} for ${postCommit.filePath}.`,
      meta: `Commit ${postCommit.commitSha.slice(0, 7)}`,
      tone: "success",
    });
  }

  if (pullRequest) {
    messages.push({
      id: "pull-request",
      role: "assistant",
      title: "Pull request ready",
      body: `PR #${pullRequest.prNumber} is now open for branch ${pullRequest.branchName}.`,
      actionHref: pullRequest.prUrl,
      actionLabel: "Open Pull Request",
      meta: "GitHub review thread is live",
      tone: "success",
    });
  }

  const accessBlocked = issueResult.status !== "ok";
  const editAction = `/projects/${project.id}/issues/${issueNumber}/edit`;
  const commitAction = `/projects/${project.id}/issues/${issueNumber}/commit`;
  const cancelAction = `/projects/${project.id}/issues/${issueNumber}/edit/cancel`;
  const pullRequestAction = `/projects/${project.id}/issues/${issueNumber}/pull-request`;

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

      <IssueChatWorkspace
        accessBlocked={accessBlocked}
        cancelAction={cancelAction}
        commitAction={commitAction}
        editAction={editAction}
        initialFilePath={pendingEdit?.filePath ?? "README.md"}
        initialInstruction={
          pendingEdit?.userInstruction ??
          `Append "hello world" to the selected file for issue #${issueNumber}.`
        }
        initialMessages={messages}
        issueNumber={issueNumber}
        pendingEdit={
          pendingEdit
            ? {
                filePath: pendingEdit.filePath,
                model: pendingEdit.model,
                originalContent: pendingEdit.originalContent,
                summary: pendingEdit.summary,
                updatedContent: pendingEdit.updatedContent,
                userInstruction: pendingEdit.userInstruction,
              }
            : null
        }
        postCommitExists={Boolean(postCommit)}
        pullRequestAction={pullRequestAction}
        pullRequestExists={Boolean(pullRequest)}
        pullRequestUrl={pullRequest?.prUrl}
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
