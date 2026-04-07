import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { env } from "~/env";
import {
  GITHUB_API_VERSION,
  GITHUB_FLOW_COOKIE,
  GITHUB_PKCE_COOKIE,
  GITHUB_STATE_COOKIE,
} from "~/server/github/constants";

type GithubTokenResponse = {
  access_token?: string;
  error?: string;
};

type GithubUserResponse = {
  id: number;
  login: string;
};

type GithubOAuthFlow = "connect" | "import-session";

function toBase64Url(input: Buffer) {
  return input
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function createPkcePair() {
  const codeVerifier = toBase64Url(randomBytes(32));
  const codeChallenge = toBase64Url(
    createHash("sha256").update(codeVerifier).digest(),
  );

  return { codeChallenge, codeVerifier };
}

function createState() {
  return toBase64Url(randomBytes(32));
}

async function exchangeGithubCodeForAccessToken(code: string, codeVerifier: string) {
  const tokenUrl = new URL("https://github.com/login/oauth/access_token");
  tokenUrl.searchParams.set("client_id", env.GITHUB_APP_CLIENT_ID);
  tokenUrl.searchParams.set("client_secret", env.GITHUB_APP_CLIENT_SECRET);
  tokenUrl.searchParams.set("code", code);
  tokenUrl.searchParams.set("redirect_uri", env.GITHUB_APP_CALLBACK_URL);
  tokenUrl.searchParams.set("code_verifier", codeVerifier);

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "User-Agent": "devin-app",
    },
    cache: "no-store",
  });

  if (!tokenResponse.ok) {
    throw new Error("token_exchange_failed");
  }

  const tokenData = (await tokenResponse.json()) as GithubTokenResponse;

  if (!tokenData.access_token) {
    throw new Error(tokenData.error ?? "missing_access_token");
  }

  return tokenData.access_token;
}

export async function beginGithubOauth(flow: GithubOAuthFlow) {
  const cookieStore = await cookies();
  const state = createState();
  const { codeChallenge, codeVerifier } = createPkcePair();

  cookieStore.set(GITHUB_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 60 * 10,
    path: "/",
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
  });

  cookieStore.set(GITHUB_PKCE_COOKIE, codeVerifier, {
    httpOnly: true,
    maxAge: 60 * 10,
    path: "/",
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
  });

  cookieStore.set(GITHUB_FLOW_COOKIE, flow, {
    httpOnly: true,
    maxAge: 60 * 10,
    path: "/",
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
  });

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", env.GITHUB_APP_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", env.GITHUB_APP_CALLBACK_URL);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  return authorizeUrl.toString();
}

async function completeGithubOauth(code: string, state: string) {
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GITHUB_STATE_COOKIE)?.value;
  const codeVerifier = cookieStore.get(GITHUB_PKCE_COOKIE)?.value;
  const flow = cookieStore.get(GITHUB_FLOW_COOKIE)?.value as GithubOAuthFlow | undefined;

  cookieStore.delete(GITHUB_STATE_COOKIE);
  cookieStore.delete(GITHUB_PKCE_COOKIE);
  cookieStore.delete(GITHUB_FLOW_COOKIE);

  if (!expectedState || expectedState !== state) {
    throw new Error("invalid_state");
  }

  if (!codeVerifier) {
    throw new Error("missing_code_verifier");
  }

  if (!flow) {
    throw new Error("missing_github_flow");
  }

  const accessToken = await exchangeGithubCodeForAccessToken(code, codeVerifier);

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "devin-app",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
    cache: "no-store",
  });

  if (!userResponse.ok) {
    throw new Error("user_fetch_failed");
  }

  const userData = (await userResponse.json()) as GithubUserResponse;

  return {
    accessToken,
    flow,
    githubConnectionReference: String(userData.id),
    githubUsername: userData.login,
  };
}

export async function completeGithubConnect(code: string, state: string) {
  const result = await completeGithubOauth(code, state);

  if (result.flow !== "connect") {
    throw new Error("unexpected_github_flow");
  }

  return result;
}

export async function completeGithubImportSession(code: string, state: string) {
  const result = await completeGithubOauth(code, state);

  if (result.flow !== "import-session") {
    throw new Error("unexpected_github_flow");
  }

  return result;
}

export async function readGithubOauthFlow() {
  const cookieStore = await cookies();
  return cookieStore.get(GITHUB_FLOW_COOKIE)?.value as GithubOAuthFlow | undefined;
}
