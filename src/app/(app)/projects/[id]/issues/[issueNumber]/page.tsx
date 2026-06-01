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

function getStatusMessage(
  error: string | undefined,
  success: string | undefined,
): AIChatMessage | null {
  if (success) {
    const successCopy: Record<string, Pick<AIChatMessage, "body" | "tone">> = {
      edit_prepared: {
        body: "The sandbox edit was applied successfully. You can keep iterating from this issue workspace.",
        tone: "success",
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
    const errorCopy: Record<string, Pick<AIChatMessage, "body" | "tone">> = {
      missing_file_path: {
        body: "Add the repository file path in the file section before asking Devin to prepare the edit.",
        tone: "error",
      },
      missing_instruction: {
        body: "The composer needs an instruction before it can prepare the change for this issue.",
        tone: "error",
      },
      file_not_found: {
        body: "That file path does not exist in this sandboxed repository. Try an exact repo-relative path and prepare again.",
        tone: "error",
      },
      unsupported_file: {
        body: "This MVP can only prepare text-based file changes right now. Pick a plain text source file and try again.",
        tone: "error",
      },
      edit_access_missing: {
        body: "GitHub access for this repository is missing or expired, so the edit cannot be prepared from this workspace yet.",
        tone: "error",
      },
      issue_unavailable: {
        body: "The issue details could not be loaded from GitHub right now, so the workspace is paused until that recovers.",
        tone: "error",
      },
      edit_ai_unavailable: {
        body: "The edit preparation service is not configured right now, so the chat can show the workflow but cannot apply a new change yet.",
        tone: "error",
      },
      invalid_path: {
        body: "Use a repository-relative file path inside the sandbox workspace, then prepare the edit again.",
        tone: "error",
      },
      edit_no_changes: {
        body: "The prepared result matched the current file, so there was nothing new to apply. Tighten the instruction and try again.",
        tone: "warning",
      },
      edit_invalid_response: {
        body: "The generated edit came back in an unusable format. Try the request again with a simpler instruction.",
        tone: "error",
      },
      edit_provider_rejected_request: {
        body: "The AI provider rejected this edit request. The server log now includes the OpenRouter response details so we can see whether the model, structured-output settings, or another parameter caused it.",
        tone: "error",
      },
      edit_rate_limited: {
        body: "OpenRouter rate limited this edit request. Wait a moment, then retry from the same issue workspace.",
        tone: "warning",
      },
      edit_generation_failed: {
        body: "The model failed while preparing the change. The workspace is still intact, and you can retry from the composer.",
        tone: "error",
      },
      missing_session_id: {
        body: "Start the sandbox first so Devin has a live workspace to edit.",
        tone: "error",
      },
      sandbox_not_running: {
        body: "The sandbox is not running right now. Start it again, then retry the edit from this issue thread.",
        tone: "error",
      },
      session_not_found: {
        body: "This sandbox session is no longer available. Start a fresh sandbox and prepare the edit again.",
        tone: "error",
      },
      chat_persist_failed: {
        body: "The edit was prepared, but the chat could not be saved. Retry once so the conversation history stays durable.",
        tone: "error",
      },
      edit_prepare_failed: {
        body: "The edit could not be staged for this issue. Retry once, and if it persists we can narrow the target file further.",
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
  const statusMessage = getStatusMessage(error, success);

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
        issueNumber={issueNumber}
        projectId={project.id}
        restartPreviewAction={`${sandboxBaseAction}/restart-preview`}
        sessionAction={`${sandboxBaseAction}/session`}
        startAction={`${sandboxBaseAction}/start`}
        stopAction={`${sandboxBaseAction}/stop`}
      />

      <IssueChatWorkspace
        accessBlocked={accessBlocked}
        editAction={editAction}
        initialFilePath="src/pages/ProjectsPage.jsx"
        initialInstruction="Currently this page renders all projects. Change it so that only the first two projects are rendered."
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
