import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { beginGithubOauth } from "~/server/github/oauth";

export async function GET() {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn({ returnBackUrl: "/projects/new" });
  }

  const authorizeUrl = await beginGithubOauth("import-session");
  return NextResponse.redirect(authorizeUrl);
}
