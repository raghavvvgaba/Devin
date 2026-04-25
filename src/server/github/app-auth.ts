import { createSign } from "node:crypto";

import { unstable_cache } from "next/cache";

import { env } from "~/env";
import {
  getInstallationTokenTag,
  getRepoInstallationTag,
} from "~/server/github/cache";
import { GITHUB_API_VERSION } from "~/server/github/constants";

type GithubInstallationResponse = {
  id: number;
};

type GithubInstallationTokenResponse = {
  token: string;
};

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function getGithubPrivateKey() {
  return env.GITHUB_APP_PRIVATE_KEY.replaceAll("\\n", "\n");
}

function createGithubAppJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      exp: now + 9 * 60,
      iat: now - 60,
      iss: env.GITHUB_APP_ID,
    }),
  );

  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();

  const signature = signer.sign(getGithubPrivateKey()).toString("base64url");

  return `${signingInput}.${signature}`;
}

async function githubAppFetch<T>(path: string, init?: RequestInit) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${createGithubAppJwt()}`,
      "User-Agent": "devin-app",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      ...(init?.headers ?? {}),
    },
  });

  return response;
}

export async function getRepoInstallationId(repoOwner: string, repoName: string) {
  return unstable_cache(
    async () => {
      const response = await githubAppFetch<GithubInstallationResponse>(
        `/repos/${repoOwner}/${repoName}/installation`,
      );

      if (response.status === 404 || response.status === 403) {
        return null;
      }

      if (!response.ok) {
        throw new Error("github_installation_lookup_failed");
      }

      const installation = (await response.json()) as GithubInstallationResponse;
      return installation.id;
    },
    ["github-installation-id", repoOwner.toLowerCase(), repoName.toLowerCase()],
    {
      revalidate: 60 * 10,
      tags: [getRepoInstallationTag(repoOwner, repoName)],
    },
  )();
}

export async function createInstallationAccessToken(installationId: number) {
  return unstable_cache(
    async () => {
      const response = await githubAppFetch<GithubInstallationTokenResponse>(
        `/app/installations/${installationId}/access_tokens`,
        { method: "POST" },
      );

      if (!response.ok) {
        throw new Error("github_installation_token_failed");
      }

      const data = (await response.json()) as GithubInstallationTokenResponse;
      return data.token;
    },
    ["github-installation-token", String(installationId)],
    {
      revalidate: 60 * 50,
      tags: [getInstallationTokenTag(installationId)],
    },
  )();
}

export async function getRepoInstallationAccessToken(
  repoOwner: string,
  repoName: string,
) {
  const installationId = await getRepoInstallationId(repoOwner, repoName);

  if (!installationId) {
    return null;
  }

  return createInstallationAccessToken(installationId);
}
