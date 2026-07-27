import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { env } from "~/env";
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
    returnTo?.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/onboarding/github";

  return NextResponse.redirect(
    new URL(`${redirectTarget}?success=disconnected`, env.APP_URL),
    { status: 303 },
  );
}
