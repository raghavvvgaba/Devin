import { redirect } from "next/navigation";

import { type AIChatMessage } from "~/components/ui/ai-chat";
import { buildIssueChatStatusMessage } from "~/lib/issue-chat-messages";
import {
  getIssueChatMessages,
  getOrCreateIssueChatSession,
} from "~/server/chat";
import { db } from "~/server/db";
import { getGithubConnectionStatus } from "~/server/github/connection";
import {
  fetchProjectIssue,
  fetchProjectOpenIssues,
  type ProjectIssueResult,
  type ProjectIssuesResult,
} from "~/server/github/issues";
import {
  fetchGithubViewerLogin,
  fetchImportRepositories,
} from "~/server/github/repos";
import { readGithubImportSession } from "~/server/github/import-session";

const githubOnboardingMilestones = [
  "Authorize the GitHub App on your user account",
  "Install the app on the target account or organization",
  "Return here and initialize repository import",
] as const;

const githubOnboardingErrorMessages: Record<string, string> = {
  access_denied:
    "GitHub authorization was cancelled before the app could connect your account.",
  github_connect_failed:
    "GitHub connection did not complete successfully. Please try again.",
  github_required: "Connect GitHub before importing a repository.",
  invalid_state:
    "The GitHub callback could not be verified. Please restart the connection flow.",
  missing_callback_params:
    "GitHub did not return the expected callback parameters.",
  missing_code_verifier:
    "The secure GitHub verification data expired. Please try connecting again.",
  token_exchange_failed: "GitHub did not return a usable access token.",
  user_fetch_failed:
    "GitHub connected, but the user profile lookup failed afterward.",
};

const newProjectErrorMessages: Record<string, string> = {
  github_required: "Connect GitHub before importing a repository.",
  github_repo_fetch_failed:
    "GitHub did not return the repository list. Refresh access and try again.",
  missing_repo_selection: "Choose a repository before importing.",
  refresh_import_session:
    "Your GitHub import session expired. Refresh repository access and try again.",
  repo_needs_access:
    "That repository is visible, but the GitHub App does not have access yet.",
  repo_not_in_session:
    "That repository is not in the current GitHub import session. Refresh and try again.",
};

const newProjectSuccessMessages: Record<string, string> = {
  import_session_ready:
    "Repository access refreshed. You can import any repo marked Ready.",
};

type NewProjectPageSearchParams = {
  error?: string;
  owner?: string;
  success?: string;
};

type GithubOnboardingPageSearchParams = {
  error?: string;
  success?: string;
};

type IssueWorkspaceSearchState = {
  error?: string;
  success?: string;
};

export async function getOwnedProject(projectId: string, userId: string) {
  return db.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
  });
}

export async function listProjectsForUser(userId: string) {
  return db.project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listImportedProjectsForUser(userId: string) {
  return db.project.findMany({
    where: { userId },
    select: {
      id: true,
      repoName: true,
      repoOwner: true,
    },
  });
}

export async function getDashboardPageData(userId: string) {
  const [projects, githubStatus] = await Promise.all([
    listProjectsForUser(userId),
    getGithubConnectionStatus(userId),
  ]);

  return { githubStatus, projects };
}

export async function getGithubOnboardingPageData(
  userId: string,
  params: GithubOnboardingPageSearchParams,
) {
  const status = await getGithubConnectionStatus(userId);
  const errorMessage = params.error
    ? (githubOnboardingErrorMessages[params.error] ?? null)
    : null;
  const successMessage =
    params.success === "connected"
      ? "GitHub identity successfully mapped to Clerk session."
      : params.success === "disconnected"
        ? "GitHub identity unmapped. Local project records purged."
        : null;
  const nextStepMessage = !status.connected
    ? "Connect your GitHub account to unlock repository import."
    : "Install the GitHub App and continue to repository import.";

  return {
    errorMessage,
    milestones: githubOnboardingMilestones,
    nextStepMessage,
    status,
    successMessage,
  };
}

export async function getNewProjectPageData(
  userId: string,
  params: NewProjectPageSearchParams,
) {
  const githubStatus = await getGithubConnectionStatus(userId);

  if (!githubStatus.connected) {
    redirect("/onboarding/github?error=github_required");
  }

  const importSession = await readGithubImportSession();
  const importedProjects = await listImportedProjectsForUser(userId);
  const importedProjectsRecord = Object.fromEntries(
    importedProjects.map((project) => [
      `${project.repoOwner.toLowerCase()}/${project.repoName.toLowerCase()}`,
      project.id,
    ]),
  );

  let repoList: Awaited<ReturnType<typeof fetchImportRepositories>> | null = null;
  let viewerLogin: string | null = null;
  let sessionError: string | null = null;

  if (importSession) {
    try {
      [repoList, viewerLogin] = await Promise.all([
        fetchImportRepositories(importSession.accessToken),
        fetchGithubViewerLogin(importSession.accessToken),
      ]);
    } catch {
      sessionError =
        newProjectErrorMessages.github_repo_fetch_failed ??
        "GitHub did not return the repository list. Refresh access and try again.";
    }
  }

  const errorMessage =
    sessionError ??
    (params.error ? (newProjectErrorMessages[params.error] ?? null) : null) ??
    null;
  const successMessage = params.success
    ? (newProjectSuccessMessages[params.success] ?? null)
    : null;
  const ownerOptions = repoList
    ? Array.from(new Set(repoList.map((repo) => repo.owner))).sort((a, b) => {
        if (viewerLogin && a.toLowerCase() === viewerLogin.toLowerCase()) {
          return -1;
        }

        if (viewerLogin && b.toLowerCase() === viewerLogin.toLowerCase()) {
          return 1;
        }

        return a.localeCompare(b);
      })
    : [];
  const selectedOwner =
    ownerOptions.find(
      (owner) => params.owner?.toLowerCase() === owner.toLowerCase(),
    ) ??
    ownerOptions.find(
      (owner) => viewerLogin?.toLowerCase() === owner.toLowerCase(),
    ) ??
    ownerOptions[0] ??
    "";
  const filteredRepos =
    repoList?.filter((repo) => repo.owner === selectedOwner) ?? [];

  return {
    errorMessage,
    filteredRepos,
    importSession,
    importedProjectsRecord,
    ownerOptions,
    repoList,
    selectedOwner,
    successMessage,
  };
}

export async function getProjectPageData(userId: string, projectId: string) {
  const project = await getOwnedProject(projectId, userId);

  if (!project) {
    return { notFound: true as const };
  }

  const issuesResult = await fetchProjectOpenIssues(
    project.repoOwner,
    project.repoName,
  );

  return {
    issuesResult,
    notFound: false as const,
    project,
  };
}

export async function getIssueWorkspacePageData(
  userId: string,
  projectId: string,
  issueNumber: number,
  searchState: IssueWorkspaceSearchState,
) {
  if (Number.isNaN(issueNumber)) {
    return { notFound: true as const };
  }

  const project = await getOwnedProject(projectId, userId);

  if (!project) {
    return { notFound: true as const };
  }

  const issueResult = await fetchProjectIssue(
    project.repoOwner,
    project.repoName,
    issueNumber,
  );

  if (issueResult.status === "not_found") {
    return { notFound: true as const };
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
  const statusMessage = buildIssueChatStatusMessage(searchState);

  if (statusMessage) {
    messages.unshift(statusMessage);
  }

  return {
    accessBlocked: issueResult.status !== "ok",
    issueResult,
    issueTitle,
    messages,
    notFound: false as const,
    project,
  };
}
