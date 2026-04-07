import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { beginGithubOauth } from "~/server/github/oauth";

export async function GET() {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn({ returnBackUrl: "/onboarding/github" });
  }

  const authorizeUrl = await beginGithubOauth("connect");
  return NextResponse.redirect(authorizeUrl);
}
