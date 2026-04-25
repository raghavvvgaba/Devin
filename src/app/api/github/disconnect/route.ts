import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ensureUserRecord } from "~/server/auth/sync-user";
import { disconnectGithub } from "~/server/github/connection";

export async function POST(request: Request) {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn({ returnBackUrl: "/onboarding/github" });
  }

  await ensureUserRecord(userId);
  await disconnectGithub(userId);

  const requestUrl = new URL(request.url);
  const returnTo = requestUrl.searchParams.get("returnTo");
  const redirectTarget =
    returnTo && returnTo.startsWith("/") ? returnTo : "/onboarding/github";

  return NextResponse.redirect(
    new URL(`${redirectTarget}?success=disconnected`, request.url),
    { status: 303 },
  );
}
