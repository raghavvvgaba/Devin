import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { env } from "~/env";
import { ensureUserRecord } from "~/server/auth/sync-user";
import { markGithubConnected } from "~/server/github/connection";
import { writeGithubImportSession } from "~/server/github/import-session";
import {
  completeGithubConnect,
  completeGithubImportSession,
  readGithubOauthFlow,
} from "~/server/github/oauth";

const knownErrors = new Set([
  "github_connect_failed",
  "github_import_session_failed",
  "invalid_state",
  "missing_callback_params",
  "missing_code_verifier",
  "missing_github_flow",
  "token_exchange_failed",
  "unexpected_github_flow",
  "user_fetch_failed",
]);

export async function GET(request: Request) {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn({ returnBackUrl: "/onboarding/github" });
  }

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (error) {
    return NextResponse.redirect(
      new URL(`/onboarding/github?error=${error}`, env.APP_URL),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/onboarding/github?error=missing_callback_params", env.APP_URL),
    );
  }

  try {
    const flow = await readGithubOauthFlow();

    if (flow === "import-session") {
      const githubImportSession = await completeGithubImportSession(code, state);

      await writeGithubImportSession(githubImportSession.accessToken);

      return NextResponse.redirect(
        new URL(
          "/projects?newImport=true&success=import_session_ready",
          env.APP_URL,
        ),
      );
    }

    await ensureUserRecord(userId);
    const githubUser = await completeGithubConnect(code, state);

    await markGithubConnected({
      userId,
      githubConnectionReference: githubUser.githubConnectionReference,
      githubUsername: githubUser.githubUsername,
    });

    return NextResponse.redirect(
      new URL("/onboarding/github?success=connected", env.APP_URL),
    );
  } catch (error_) {
    const rawMessage =
      error_ instanceof Error ? error_.message : "github_connect_failed";
    const errorMessage = knownErrors.has(rawMessage)
      ? rawMessage
      : "github_connect_failed";

    return NextResponse.redirect(
      new URL(`/onboarding/github?error=${errorMessage}`, env.APP_URL),
    );
  }
}
