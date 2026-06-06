import { unstable_cache } from "next/cache";

import {
  getImportRepositoriesTag,
  hashGithubImportToken,
} from "~/server/github/cache";
import { GITHUB_API_VERSION } from "~/server/github/constants";
import type { RepoImportItem } from "~/lib/github-types";

type GithubRepo = {
  id: number;
  full_name: string;
  name: string;
  owner: {
    login: string;
  };
  private: boolean;
};

type GithubInstallation = {
  id: number;
};

type GithubUserResponse = {
  login: string;
};

type GithubUserInstallationsResponse = {
  installations: GithubInstallation[];
};

type GithubInstallationReposResponse = {
  repositories: GithubRepo[];
};

async function githubFetch<T>(path: string, accessToken: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "devin-app",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
  });

  if (!response.ok) {
    throw new Error("github_repo_fetch_failed");
  }

  return (await response.json()) as T;
}

async function fetchImportRepositoriesUncached(accessToken: string) {
  const visibleRepos = await githubFetch<GithubRepo[]>(
    "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
    accessToken,
  );

  const installations = await githubFetch<GithubUserInstallationsResponse>(
    "/user/installations?per_page=100",
    accessToken,
  );

  const repoLists = await Promise.all(
    installations.installations.map((installation) =>
      githubFetch<GithubInstallationReposResponse>(
        `/user/installations/${installation.id}/repositories?per_page=100`,
        accessToken,
      ),
    ),
  );

  const appAccessibleRepos = new Set(
    repoLists.flatMap((item) =>
      item.repositories.map((repository) => repository.full_name.toLowerCase()),
    ),
  );

  const dedupedRepos = new Map<string, GithubRepo>();

  for (const repo of visibleRepos) {
    dedupedRepos.set(repo.full_name.toLowerCase(), repo);
  }

  return Array.from(dedupedRepos.values())
    .map<RepoImportItem>((repo) => ({
      fullName: repo.full_name,
      id: repo.id,
      name: repo.name,
      owner: repo.owner.login,
      private: repo.private,
      status: appAccessibleRepos.has(repo.full_name.toLowerCase())
        ? "ready"
        : "needs_access",
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function fetchImportRepositories(accessToken: string) {
  const tokenHash = hashGithubImportToken(accessToken);

  return unstable_cache(
    async () => fetchImportRepositoriesUncached(accessToken),
    ["github-import-repositories", tokenHash],
    {
      revalidate: 60,
      tags: [getImportRepositoriesTag(tokenHash)],
    },
  )();
}

export async function fetchGithubViewerLogin(accessToken: string) {
  const tokenHash = hashGithubImportToken(accessToken);

  return unstable_cache(
    async () => {
      const user = await githubFetch<GithubUserResponse>("/user", accessToken);

      return user.login;
    },
    ["github-import-viewer", tokenHash],
    {
      revalidate: 60,
      tags: [getImportRepositoriesTag(tokenHash)],
    },
  )();
}
