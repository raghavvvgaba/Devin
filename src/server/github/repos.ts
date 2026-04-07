import { GITHUB_API_VERSION } from "~/server/github/constants";

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

type GithubUserInstallationsResponse = {
  installations: GithubInstallation[];
};

type GithubInstallationReposResponse = {
  repositories: GithubRepo[];
};

type RepoImportItem = {
  id: number;
  name: string;
  owner: string;
  fullName: string;
  private: boolean;
  status: "ready" | "needs_access";
};

async function githubFetch<T>(path: string, accessToken: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "devin-app",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("github_repo_fetch_failed");
  }

  return (await response.json()) as T;
}

export async function fetchImportRepositories(accessToken: string) {
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
