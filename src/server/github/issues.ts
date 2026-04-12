import { GITHUB_API_VERSION } from "~/server/github/constants";
import { getRepoInstallationAccessToken } from "~/server/github/app-auth";

type GithubIssueResponse = {
  id: number;
  number: number;
  title: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  comments: number;
  user: {
    login: string;
  };
  pull_request?: {
    url: string;
  };
};

export type ProjectIssue = {
  author: string;
  comments: number;
  createdAt: string;
  id: number;
  number: number;
  title: string;
  updatedAt: string;
  url: string;
};

export type ProjectIssuesResult =
  | {
      issues: ProjectIssue[];
      status: "ok";
    }
  | {
      issues: [];
      status: "missing_access" | "error";
    };

export async function fetchProjectOpenIssues(
  repoOwner: string,
  repoName: string,
): Promise<ProjectIssuesResult> {
  const installationToken = await getRepoInstallationAccessToken(
    repoOwner,
    repoName,
  );

  if (!installationToken) {
    return {
      issues: [],
      status: "missing_access",
    };
  }

  const response = await fetch(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues?state=open&per_page=10`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${installationToken}`,
        "User-Agent": "devin-app",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      cache: "no-store",
    },
  );

  if (response.status === 404 || response.status === 403) {
    return {
      issues: [],
      status: "missing_access",
    };
  }

  if (!response.ok) {
    return {
      issues: [],
      status: "error",
    };
  }

  const issues = ((await response.json()) as GithubIssueResponse[])
    .filter((issue) => !issue.pull_request)
    .slice(0, 10)
    .map<ProjectIssue>((issue) => ({
      author: issue.user.login,
      comments: issue.comments,
      createdAt: issue.created_at,
      id: issue.id,
      number: issue.number,
      title: issue.title,
      updatedAt: issue.updated_at,
      url: issue.html_url,
    }));

  return {
    issues,
    status: "ok",
  };
}
