import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  ChevronLeft,
  Clock,
  ExternalLink,
  GitBranch,
  Github,
  MessageSquare,
  PencilLine,
  ShieldAlert,
  Terminal,
} from "lucide-react";

import { AppShell } from "~/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Separator } from "~/components/ui/separator";
import { env } from "~/env";
import { fetchProjectIssue } from "~/server/github/issues";
import { readPendingProjectEdit } from "~/server/github/pending-edit-session";
import { readPostCommitResult } from "~/server/github/post-commit-session";
import { readPullRequestResult } from "~/server/github/pull-request-session";
import { getOwnedProject } from "~/server/projects";

type IssuePageProps = {
  params: Promise<{ id: string; issueNumber: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

const successMessages: Record<string, string> = {
  commit_created: "Branch and commit created successfully for this issue.",
  edit_cleared: "Prepared edit cleared from the active issue session.",
  edit_prepared: 'Pending edit prepared. "hello world" is staged for this issue.',
  pr_already_exists: "An open pull request already exists for this issue branch.",
  pr_created: "Pull request created successfully for this issue.",
};

const errorMessages: Record<string, string> = {
  commit_access_missing:
    "GitHub App write access is unavailable. Reinstall or re-grant the app before committing.",
  commit_failed:
    "GitHub rejected the branch or file update request while creating the commit.",
  edit_access_missing:
    "Repository edit access is unavailable. Reinstall or re-grant the GitHub App before preparing edits.",
  edit_prepare_failed:
    "GitHub returned an unexpected response while preparing the file edit.",
  file_not_found:
    "The requested file path does not exist in this repository.",
  issue_unavailable:
    "This issue could not be loaded from GitHub right now.",
  missing_file_path: "Enter a file path before preparing the edit.",
  pending_edit_missing:
    "No prepared edit exists for this issue. Prepare an edit before committing.",
  post_commit_missing:
    "No branch and commit result exists for this issue. Create the commit before opening a pull request.",
  pr_access_missing:
    "GitHub App pull request access is unavailable. Reinstall or re-grant the app before creating a pull request.",
  pr_create_failed:
    "GitHub rejected the pull request creation request for this issue branch.",
  stale_pending_edit:
    "A prepared edit exists for a different issue. Re-open that issue or prepare a new edit here.",
};

function getEditPreviewLines(content: string) {
  const lines = content.split("\n");
  const normalizedLines =
    lines.at(-1) === "" ? lines.slice(0, -1) : lines;
  const addedLine = normalizedLines.at(-1) ?? "hello world";
  const contextLines = normalizedLines.slice(-5, -1).map((line, index, array) => ({
    line,
    number: normalizedLines.length - array.length + index,
  }));
  const addedLineNumber = normalizedLines.length;

  return {
    addedLine,
    addedLineNumber,
    contextLines,
  };
}

export default async function ProjectIssuePage({
  params,
  searchParams,
}: IssuePageProps) {
  const { userId } = await auth();
  const { id, issueNumber: rawIssueNumber } = await params;
  const issueNumber = Number(rawIssueNumber);
  const query = await searchParams;
  const project = await getOwnedProject(id, userId!);

  if (!project || Number.isNaN(issueNumber)) {
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

  const pendingEdit = await readPendingProjectEdit(project.id, issueNumber);
  const postCommitResult = await readPostCommitResult(project.id, issueNumber);
  const pullRequestResult = await readPullRequestResult(project.id, issueNumber);
  const currentIssue = issueResult.status === "ok" ? issueResult.issue : null;
  const editPreview = pendingEdit
    ? getEditPreviewLines(pendingEdit.updatedContent)
    : null;
  const nextStepMessage =
    issueResult.status !== "ok"
      ? "Restore GitHub App access before continuing the issue workflow."
      : pullRequestResult
        ? "Pull request is open. Review it on GitHub or return to the project list."
        : postCommitResult
          ? "Branch and commit are ready. Open the pull request next."
          : pendingEdit
            ? "The edit is staged for this issue. Create the branch and commit next."
            : "Prepare the file edit for this issue to start the change workflow.";
  const successMessage = query.success
    ? (successMessages[query.success] ?? null)
    : null;
  const errorMessage = query.error ? (errorMessages[query.error] ?? null) : null;

  return (
    <AppShell
      description="Issue workspace online. Review the issue, prepare the fixed MVP change, and commit it to a dedicated GitHub branch."
      title="Issue Terminal"
    >
      <div className="space-y-8">
        <Alert className="rounded-none border-primary/20 bg-primary/5">
          <Activity className="h-4 w-4 text-primary" />
          <AlertTitle className="text-[10px] font-bold uppercase tracking-widest">
            Next Step
          </AlertTitle>
          <AlertDescription className="mt-1 text-xs font-medium uppercase">
            {nextStepMessage}
          </AlertDescription>
        </Alert>

        {successMessage ? (
          <Alert className="rounded-none border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
            <Activity className="h-4 w-4 text-emerald-500" />
            <AlertTitle className="text-[10px] font-bold uppercase tracking-widest">
              System Notice
            </AlertTitle>
            <AlertDescription className="mt-1 text-xs font-medium uppercase">
              {successMessage}
            </AlertDescription>
          </Alert>
        ) : null}

        {errorMessage ? (
          <Alert
            variant="destructive"
            className="rounded-none border-destructive/20 bg-destructive/10"
          >
            <ShieldAlert className="h-4 w-4 text-destructive" />
            <AlertTitle className="text-[10px] font-bold uppercase tracking-widest text-destructive">
              Issue Workflow Error
            </AlertTitle>
            <AlertDescription className="mt-2 text-xs font-medium uppercase leading-relaxed text-destructive">
              {errorMessage}
            </AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="rounded-none border-border shadow-none bg-card">
            <CardHeader className="border-b border-border pb-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Issue
                </p>
                <CardTitle className="text-xl uppercase tracking-tight">
                  {issueResult.status === "ok"
                    ? issueResult.issue.title
                    : `Issue #${issueNumber}`}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {issueResult.status === "missing_access" ? (
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
              ) : issueResult.status === "error" ? (
                <Alert
                  variant="destructive"
                  className="rounded-none border-destructive/20 bg-destructive/10"
                >
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                  <AlertTitle className="text-[10px] font-bold uppercase tracking-widest text-destructive">
                    Issue Sync Failure
                  </AlertTitle>
                  <AlertDescription className="mt-2 text-xs font-medium uppercase leading-relaxed text-destructive">
                    GitHub returned an error while loading this issue.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge className="rounded-none bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/10 text-[10px] font-bold uppercase tracking-widest">
                      {currentIssue?.state}
                    </Badge>
                    <span className="text-xs font-bold font-mono text-muted-foreground uppercase tracking-widest">
                      ISSUE_{currentIssue?.number}
                    </span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="border border-border bg-muted/20 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Author
                      </p>
                      <p className="mt-2 text-xs font-bold font-mono uppercase">
                        {currentIssue?.author}
                      </p>
                    </div>
                    <div className="border border-border bg-muted/20 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Comments
                      </p>
                      <p className="mt-2 text-xs font-bold font-mono uppercase">
                        {currentIssue?.comments}
                      </p>
                    </div>
                    <div className="border border-border bg-muted/20 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Updated
                      </p>
                      <p className="mt-2 text-xs font-bold font-mono uppercase">
                        {new Date(currentIssue?.updatedAt ?? Date.now()).toLocaleDateString().toUpperCase()}
                      </p>
                    </div>
                  </div>

                  <div className="border border-border bg-background p-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Issue body
                    </p>
                    <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                      {currentIssue?.body?.trim() || "No issue description was provided."}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      asChild
                      variant="outline"
                      className="border-border font-bold uppercase text-[10px] tracking-widest h-10 rounded-none px-4"
                    >
                      <Link href={`/projects/${project.id}`}>
                        <ChevronLeft className="mr-2 h-3.5 w-3.5" />
                        Back to Project
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="border-border font-bold uppercase text-[10px] tracking-widest h-10 rounded-none px-4"
                    >
                      <a href={currentIssue?.url ?? "#"} rel="noreferrer" target="_blank">
                        Open on GitHub
                        <ExternalLink className="ml-2 h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card">
            <CardHeader className="border-b border-border pb-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Repository
                </p>
                <CardTitle className="text-xl uppercase tracking-tight">
                  {project.repoOwner}/{project.repoName}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center gap-4 border border-border bg-muted/30 p-4">
                  <div className="flex h-12 w-12 items-center justify-center border border-border bg-background">
                    <Github className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-lg font-bold uppercase tracking-tight">
                      Issue-linked workflow
                    </p>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Edit, branch, and commit all stay tied to #{issueNumber}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      Project ID
                    </span>
                    <span className="text-[10px] font-bold font-mono uppercase">
                      {project.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      Pending Edit
                    </span>
                    <span className="text-[10px] font-bold font-mono uppercase">
                      {pendingEdit ? "PREPARED" : "NOT RUN"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      Commit Status
                    </span>
                    <span className="text-[10px] font-bold font-mono uppercase">
                      {postCommitResult ? "RECORDED" : "PENDING"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      Pull Request
                    </span>
                    <span className="text-[10px] font-bold font-mono uppercase">
                      {pullRequestResult ? "OPENED" : "PENDING"}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {issueResult.status === "ok" ? (
          <section className="space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Command Layer
                </p>
                <h3 className="text-xl font-bold uppercase tracking-tight">
                  Edit and Commit for This Issue
                </h3>
              </div>
            </div>

            <Card className="rounded-none border-border shadow-none bg-card">
              <CardHeader className="border-b border-border pb-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    File Edit
                  </p>
                  <CardTitle className="text-xl uppercase tracking-tight">
                    Append hello world to a file
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <form
                  action={`/projects/${project.id}/issues/${issueNumber}/edit`}
                  className="space-y-4"
                  method="post"
                >
                  <div className="space-y-2">
                    <label
                      className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
                      htmlFor="filePath"
                    >
                      Target file path
                    </label>
                    <Input
                      className="rounded-none h-12 font-mono text-xs uppercase"
                      defaultValue={pendingEdit?.filePath ?? "README.md"}
                      id="filePath"
                      name="filePath"
                      placeholder="README.md"
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      className="rounded-none font-bold uppercase text-[10px] tracking-widest h-11 px-5"
                      disabled={issueResult.status !== "ok"}
                      type="submit"
                    >
                      <PencilLine className="mr-2 h-4 w-4" />
                      Prepare Edit
                    </Button>
                    {pendingEdit ? (
                      <Button
                        className="rounded-none font-bold uppercase text-[10px] tracking-widest h-11 px-5"
                        form="commit-form"
                        type="submit"
                      >
                        <GitBranch className="mr-2 h-4 w-4" />
                        Create Branch + Commit
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Operation is fixed for MVP: append &quot;hello world&quot; to an existing
                    file for issue #{issueNumber}.
                  </p>
                </form>

                {pendingEdit ? (
                  <form
                    action={`/projects/${project.id}/issues/${issueNumber}/edit/cancel`}
                    method="post"
                  >
                    <Button
                      className="rounded-none font-bold uppercase text-[10px] tracking-widest h-11 px-5"
                      type="submit"
                      variant="outline"
                    >
                      Cancel Edit
                    </Button>
                  </form>
                ) : null}

                {pendingEdit ? (
                  <>
                    <Separator />
                    <div className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
                        <div className="space-y-3 border border-border bg-muted/20 p-4">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Prepared state
                          </p>
                          <div className="space-y-2">
                            <Badge className="rounded-none bg-cyan-500/10 text-cyan-500 border-cyan-500/20 hover:bg-cyan-500/10 text-[10px] font-bold uppercase tracking-widest">
                              Pending Edit
                            </Badge>
                            <p className="text-xs font-bold font-mono uppercase break-all">
                              {pendingEdit.filePath}
                            </p>
                            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground break-all">
                              SHA {pendingEdit.originalSha}
                            </p>
                            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                              LINKED TO ISSUE #{pendingEdit.issueNumber}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-3 border border-border bg-background p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                Preview diff
                              </p>
                              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70">
                                Unified view styled after code review diffs
                              </p>
                            </div>
                            <Badge className="rounded-none border-emerald-500/20 bg-emerald-500/10 text-[10px] font-bold uppercase tracking-widest text-emerald-500 hover:bg-emerald-500/10">
                              +1 added
                            </Badge>
                          </div>
                          <div className="overflow-hidden border border-border bg-muted/10">
                            <div className="flex items-center justify-between border-b border-border bg-background px-4 py-2">
                              <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-foreground">
                                  {pendingEdit.filePath}
                                </span>
                              </div>
                              <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                                Issue #{pendingEdit.issueNumber}
                              </span>
                            </div>
                            {editPreview?.contextLines.length ? (
                              <div className="border-b border-border bg-background/60 font-mono text-xs leading-relaxed text-muted-foreground">
                                {editPreview.contextLines.map((line, index) => (
                                  <div
                                    className="grid grid-cols-[48px_24px_1fr] gap-3 border-b border-border/40 px-4 py-2 last:border-b-0"
                                    key={`${line.number}-${index}`}
                                  >
                                    <span className="text-right text-muted-foreground/40">
                                      {line.number}
                                    </span>
                                    <span className="text-center text-muted-foreground/50">
                                      ·
                                    </span>
                                    <span className="break-words whitespace-pre-wrap">
                                      {line.line || "\u00A0"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            <div className="border-l-2 border-emerald-500 bg-emerald-500/12 font-mono text-xs leading-relaxed text-emerald-300 shadow-[inset_0_1px_0_rgba(16,185,129,0.12)]">
                              <div className="grid grid-cols-[48px_24px_1fr] gap-3 px-4 py-3">
                                <span className="text-right text-emerald-500/80">
                                  {editPreview?.addedLineNumber}
                                </span>
                                <span className="text-center font-bold text-emerald-500">
                                  +
                                </span>
                                <span className="break-words whitespace-pre-wrap">
                                  {editPreview?.addedLine ?? "hello world"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}

                <form
                  action={`/projects/${project.id}/issues/${issueNumber}/commit`}
                  id="commit-form"
                  method="post"
                />
              </CardContent>
            </Card>

            {postCommitResult ? (
              <Card className="rounded-none border-border shadow-none bg-card">
                <CardHeader className="border-b border-border pb-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      Commit Result
                    </p>
                    <CardTitle className="text-xl uppercase tracking-tight">
                      Branch and commit recorded
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="border border-border bg-muted/20 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Branch
                      </p>
                      <p className="mt-2 text-xs font-bold font-mono uppercase break-all">
                        {postCommitResult.branchName}
                      </p>
                    </div>
                    <div className="border border-border bg-muted/20 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Commit SHA
                      </p>
                      <p className="mt-2 text-xs font-bold font-mono uppercase break-all">
                        {postCommitResult.commitSha}
                      </p>
                    </div>
                    <div className="border border-border bg-muted/20 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        File
                      </p>
                      <p className="mt-2 text-xs font-bold font-mono uppercase break-all">
                        {postCommitResult.filePath}
                      </p>
                    </div>
                  </div>
                  {!pullRequestResult ? (
                    <div className="mt-6 flex flex-wrap gap-3">
                      <form
                        action={`/projects/${project.id}/issues/${issueNumber}/pull-request`}
                        method="post"
                      >
                        <Button className="rounded-none font-bold uppercase text-[10px] tracking-widest h-11 px-5">
                          Open Pull Request
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {pullRequestResult ? (
              <Card className="rounded-none border-border shadow-none bg-card">
                <CardHeader className="border-b border-border pb-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      Pull Request
                    </p>
                    <CardTitle className="text-xl uppercase tracking-tight">
                      Pull request opened
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="border border-border bg-muted/20 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        PR Number
                      </p>
                      <p className="mt-2 text-xs font-bold font-mono uppercase break-all">
                        #{pullRequestResult.prNumber}
                      </p>
                    </div>
                    <div className="border border-border bg-muted/20 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Branch
                      </p>
                      <p className="mt-2 text-xs font-bold font-mono uppercase break-all">
                        {pullRequestResult.branchName}
                      </p>
                    </div>
                    <div className="border border-border bg-muted/20 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Status
                      </p>
                      <p className="mt-2 text-xs font-bold font-mono uppercase break-all">
                        READY
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button
                      asChild
                      className="rounded-none font-bold uppercase text-[10px] tracking-widest h-11 px-5"
                    >
                      <a href={pullRequestResult.prUrl} rel="noreferrer" target="_blank">
                        Open Pull Request
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
