import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { revalidateProjectGitHubReads } from "~/server/github/cache";
import { createPullRequestForIssue } from "~/server/github/pull-requests";
import { readPostCommitResult } from "~/server/github/post-commit-session";
import { clearPullRequestResult, writePullRequestResult } from "~/server/github/pull-request-session";
import { getOwnedProject } from "~/server/projects";

type PullRequestRouteContext = {
  params: Promise<{ id: string; issueNumber: string }>;
};

function redirectToIssueWithStatus(
  request: Request,
  projectId: string,
  issueNumber: number,
  key: "error" | "success",
  value: string,
) {
  const redirectUrl = new URL(
    `/projects/${projectId}/issues/${issueNumber}`,
    request.url,
  );
  redirectUrl.searchParams.set(key, value);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}

export async function POST(request: Request, context: PullRequestRouteContext) {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn({ returnBackUrl: request.url });
  }

  const { id, issueNumber: rawIssueNumber } = await context.params;
  const issueNumber = Number(rawIssueNumber);
  const project = await getOwnedProject(id, userId);

  if (!project || Number.isNaN(issueNumber)) {
    return NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });
  }

  const postCommitResult = await readPostCommitResult(project.id, issueNumber);

  if (!postCommitResult) {
    return redirectToIssueWithStatus(
      request,
      project.id,
      issueNumber,
      "error",
      "post_commit_missing",
    );
  }

  const pullRequestResult = await createPullRequestForIssue({
    branchName: postCommitResult.branchName,
    filePath: postCommitResult.filePath,
    issueNumber,
    repoName: project.repoName,
    repoOwner: project.repoOwner,
  });

  if (pullRequestResult.status === "missing_access") {
    return redirectToIssueWithStatus(
      request,
      project.id,
      issueNumber,
      "error",
      "pr_access_missing",
    );
  }

  if (pullRequestResult.status === "error") {
    return redirectToIssueWithStatus(
      request,
      project.id,
      issueNumber,
      "error",
      "pr_create_failed",
    );
  }

  if (
    pullRequestResult.status !== "ok" &&
    pullRequestResult.status !== "already_exists"
  ) {
    return redirectToIssueWithStatus(
      request,
      project.id,
      issueNumber,
      "error",
      "pr_create_failed",
    );
  }

  const { prNumber, prUrl, status } = pullRequestResult;

  await clearPullRequestResult(project.id, issueNumber);
  await writePullRequestResult({
    branchName: postCommitResult.branchName,
    issueNumber,
    prNumber,
    projectId: project.id,
    prUrl,
  });
  revalidateProjectGitHubReads({
    issueNumber,
    repoName: project.repoName,
    repoOwner: project.repoOwner,
  });

  return redirectToIssueWithStatus(
    request,
    project.id,
    issueNumber,
    "success",
    status === "already_exists" ? "pr_already_exists" : "pr_created",
  );
}
