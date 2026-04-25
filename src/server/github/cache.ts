import { createHash } from "node:crypto";

import { revalidateTag } from "next/cache";

function getRepoCacheKey(repoOwner: string, repoName: string) {
  return `${repoOwner.toLowerCase()}/${repoName.toLowerCase()}`;
}

export function getRepoInstallationTag(repoOwner: string, repoName: string) {
  return `github-installation:${getRepoCacheKey(repoOwner, repoName)}`;
}

export function getInstallationTokenTag(installationId: number) {
  return `github-installation-token:${installationId}`;
}

export function getRepoIssuesTag(repoOwner: string, repoName: string) {
  return `github-issues:${getRepoCacheKey(repoOwner, repoName)}`;
}

export function getIssueTag(
  repoOwner: string,
  repoName: string,
  issueNumber: number,
) {
  return `github-issue:${getRepoCacheKey(repoOwner, repoName)}:${issueNumber}`;
}

export function getImportRepositoriesTag(tokenHash: string) {
  return `github-import-repos:${tokenHash}`;
}

export function hashGithubImportToken(accessToken: string) {
  return createHash("sha256").update(accessToken).digest("hex");
}

export function revalidateProjectGitHubReads(input: {
  issueNumber?: number;
  repoName: string;
  repoOwner: string;
}) {
  revalidateTag(getRepoIssuesTag(input.repoOwner, input.repoName));

  if (typeof input.issueNumber === "number") {
    revalidateTag(
      getIssueTag(input.repoOwner, input.repoName, input.issueNumber),
    );
  }
}
