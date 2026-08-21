import { NextResponse } from "next/server";

import {
  appendIssueChatMessages,
  getOrCreateIssueChatSession,
} from "~/server/chat";
import { getRepoInstallationAccessToken } from "~/server/github/app-auth";
import { revalidateProjectGitHubReads } from "~/server/github/cache";
import { fetchProjectIssue } from "~/server/github/issues";
import {
  createPullRequest,
  fetchRepositoryDefaultBranch,
  findOpenPullRequestForBranch,
} from "~/server/github/pull-requests";
import { sandboxProvider } from "~/server/sandbox/provider";
import {
  getOwnedIssueProject,
  readJsonObject,
  readStringField,
  verifyIssueSandboxAccess,
  type IssueSandboxRouteContext,
} from "~/server/sandbox/route-helpers";

export const runtime = "nodejs";
export const maxDuration = 120;

type SubmitStatus = "completed" | "failed" | "noop" | "reused";

function jsonSubmit(
  input: {
    branchName?: string;
    message: string;
    messages?: Awaited<ReturnType<typeof appendIssueChatMessages>>;
    pullRequestNumber?: number;
    pullRequestUrl?: string;
    status: SubmitStatus;
  },
  init?: ResponseInit,
) {
  return NextResponse.json(input, init);
}

function getStatusCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message === "submit_in_progress") {
    return 409;
  }

  if (message === "github_access_missing") {
    return 403;
  }

  if (message === "Sandbox is not running.") {
    return 409;
  }

  if (message === "Session not found.") {
    return 404;
  }

  return 500;
}

function getFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  switch (message) {
    case "submit_in_progress":
      return "A submit is already running for this sandbox.";
    case "github_access_missing":
      return "GitHub access for this repository is missing or does not include the required permissions.";
    case "Sandbox is not running.":
      return "The sandbox is not running right now. Start it again, then submit the changes.";
    case "Session not found.":
      return "This sandbox session is no longer available. Start a fresh sandbox and try again.";
    default:
      return message || "The pull request could not be created.";
  }
}

function mapIssueFailure(
  status: Awaited<ReturnType<typeof fetchProjectIssue>>["status"],
) {
  switch (status) {
    case "missing_access":
      return jsonSubmit(
        {
          message: "GitHub access for this repository is missing or expired.",
          status: "failed",
        },
        { status: 403 },
      );
    case "not_found":
      return jsonSubmit(
        {
          message: "This issue could not be found.",
          status: "failed",
        },
        { status: 404 },
      );
    default:
      return jsonSubmit(
        {
          message: "The issue details could not be loaded right now.",
          status: "failed",
        },
        { status: 400 },
      );
  }
}

function buildBranchName(issueNumber: number) {
  return `tessera/issue-${issueNumber}`;
}

function buildSubmitTitle(issueNumber: number, issueTitle: string) {
  return `Issue #${issueNumber}: ${issueTitle}`;
}

function buildPullRequestBody(issueNumber: number) {
  return [
    `Created by Inlaya from issue #${issueNumber}.`,
    "",
    "A human engineer should review and merge this PR if the changes look good.",
  ].join("\n");
}

function buildSubmitSummary(input: {
  branchName: string;
  message: string;
  pullRequestNumber?: number;
  pullRequestUrl?: string;
  status: "completed" | "noop" | "reused";
}) {
  switch (input.status) {
    case "completed":
      return {
        body: `Pull request created.\n\nBranch: \`${input.branchName}\`\nPR: [#${input.pullRequestNumber}](${input.pullRequestUrl})`,
        tone: "success" as const,
      };
    case "reused":
      return {
        body: `Changes were pushed and the existing pull request was reused.\n\nBranch: \`${input.branchName}\`\nPR: [#${input.pullRequestNumber}](${input.pullRequestUrl})`,
        tone: "success" as const,
      };
    default:
      return {
        body: input.message,
        tone: "warning" as const,
      };
  }
}

async function appendSubmitSummary(input: {
  branchName: string;
  issueNumber: number;
  issueTitle: string;
  message: string;
  projectId: string;
  pullRequestNumber?: number;
  pullRequestUrl?: string;
  status: "completed" | "noop" | "reused";
  userId: string;
}) {
  const chatSession = await getOrCreateIssueChatSession({
    issueNumber: input.issueNumber,
    projectId: input.projectId,
    title: input.issueTitle,
    userId: input.userId,
  });
  const summary = buildSubmitSummary(input);

  return appendIssueChatMessages(chatSession.id, [
    {
      body: summary.body,
      role: "assistant",
      tone: summary.tone,
    },
  ]);
}

async function safeAppendSubmitSummary(
  input: Parameters<typeof appendSubmitSummary>[0],
) {
  try {
    return await appendSubmitSummary(input);
  } catch (error) {
    console.error("Sandbox submit chat persistence failed:", error);
    return undefined;
  }
}

export async function POST(
  request: Request,
  context: IssueSandboxRouteContext,
) {
  const access = await getOwnedIssueProject(request, context);

  if ("response" in access) {
    const routeResponse = access.response!;
    const status = routeResponse.status === 401 ? 401 : 404;
    return jsonSubmit(
      {
        message:
          status === 401
            ? "Sign in to submit sandbox changes."
            : "This project could not be found.",
        status: "failed",
      },
      { status },
    );
  }

  const body = await readJsonObject(request);
  const sessionId = readStringField(body, "sessionId");

  if (!sessionId) {
    return jsonSubmit(
      {
        message: "Start the sandbox first so Inlaya has a live workspace.",
        status: "failed",
      },
      { status: 400 },
    );
  }

  if (
    !(await verifyIssueSandboxAccess({
      projectId: access.project.id,
      sessionId,
      userId: access.userId,
    }))
  ) {
    return jsonSubmit(
      {
        message:
          "This sandbox session is no longer available. Start a fresh sandbox and try again.",
        status: "failed",
      },
      { status: 404 },
    );
  }

  const issueResult = await fetchProjectIssue(
    access.project.repoOwner,
    access.project.repoName,
    access.issueNumber,
  );

  if (issueResult.status !== "ok") {
    return mapIssueFailure(issueResult.status);
  }

  const installationToken = await getRepoInstallationAccessToken(
    access.project.repoOwner,
    access.project.repoName,
  );

  if (!installationToken) {
    return jsonSubmit(
      {
        message: "GitHub access for this repository is missing or expired.",
        status: "failed",
      },
      { status: 403 },
    );
  }

  const branchName = buildBranchName(access.issueNumber);
  const submitTitle = buildSubmitTitle(
    access.issueNumber,
    issueResult.issue.title,
  );

  try {
    const submitResult = await sandboxProvider.submitChanges({
      branchName,
      commitMessage: submitTitle,
      installationToken,
      repoName: access.project.repoName,
      repoOwner: access.project.repoOwner,
      sessionId,
    });

    if (submitResult.status === "noop") {
      return jsonSubmit({
        branchName,
        message: submitResult.message,
        status: "noop",
      });
    }

    await sandboxProvider.setSubmitProgress({
      message: "Creating pull request",
      sessionId,
      stage: "creating-pr",
      state: "running",
    });

    const existingPullRequest = await findOpenPullRequestForBranch({
      branchName,
      installationToken,
      repoName: access.project.repoName,
      repoOwner: access.project.repoOwner,
    });
    const pullRequest =
      existingPullRequest ??
      (await createPullRequest({
        baseBranch: await fetchRepositoryDefaultBranch({
          installationToken,
          repoName: access.project.repoName,
          repoOwner: access.project.repoOwner,
        }),
        body: buildPullRequestBody(access.issueNumber),
        branchName,
        installationToken,
        repoName: access.project.repoName,
        repoOwner: access.project.repoOwner,
        title: submitTitle,
      }));
    const status = existingPullRequest ? "reused" : "completed";
    const message =
      status === "reused"
        ? "Changes were pushed and the existing pull request was reused."
        : "Pull request created.";

    await sandboxProvider.setSubmitProgress({
      message,
      sessionId,
      stage: "done",
      state: "completed",
    });

    const messages = await safeAppendSubmitSummary({
      branchName,
      issueNumber: access.issueNumber,
      issueTitle: issueResult.issue.title,
      message,
      projectId: access.project.id,
      pullRequestNumber: pullRequest.number,
      pullRequestUrl: pullRequest.url,
      status,
      userId: access.userId,
    });

    revalidateProjectGitHubReads({
      issueNumber: access.issueNumber,
      repoName: access.project.repoName,
      repoOwner: access.project.repoOwner,
    });

    return jsonSubmit({
      branchName,
      message,
      messages,
      pullRequestNumber: pullRequest.number,
      pullRequestUrl: pullRequest.url,
      status,
    });
  } catch (error) {
    try {
      await sandboxProvider.setSubmitProgress({
        message: getFailureMessage(error),
        sessionId,
        stage: "error",
        state: "failed",
      });
    } catch {
      // Keep the original submit failure as the response source.
    }

    return jsonSubmit(
      {
        message: getFailureMessage(error),
        status: "failed",
      },
      { status: getStatusCode(error) },
    );
  }
}
