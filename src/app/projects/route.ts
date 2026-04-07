import { auth } from "@clerk/nextjs/server";
import { Prisma } from "../../../generated/prisma";
import { NextResponse } from "next/server";

import { db } from "~/server/db";
import { getGithubConnectionStatus } from "~/server/github/connection";
import { readGithubImportSession } from "~/server/github/import-session";
import { fetchImportRepositories } from "~/server/github/repos";

function toErrorRedirect(url: URL, error: string) {
  const redirectUrl = new URL("/projects/new", url);
  redirectUrl.searchParams.set("error", error);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}

export async function GET() {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn({ returnBackUrl: "/dashboard" });
  }

  const projects = await db.project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn({ returnBackUrl: "/projects/new" });
  }

  const githubStatus = await getGithubConnectionStatus(userId);

  if (!githubStatus.connected) {
    return toErrorRedirect(new URL(request.url), "github_required");
  }

  const formData = await request.formData();
  const repoOwner = formData.get("repoOwner");
  const repoName = formData.get("repoName");

  if (typeof repoOwner !== "string" || typeof repoName !== "string") {
    return toErrorRedirect(new URL(request.url), "missing_repo_selection");
  }

  const importSession = await readGithubImportSession();

  if (!importSession) {
    return toErrorRedirect(new URL(request.url), "refresh_import_session");
  }

  const repos = await fetchImportRepositories(importSession.accessToken);
  const matchedRepo = repos.find(
    (repo) =>
      repo.owner.toLowerCase() === repoOwner.toLowerCase() &&
      repo.name.toLowerCase() === repoName.toLowerCase(),
  );

  if (!matchedRepo) {
    return toErrorRedirect(new URL(request.url), "repo_not_in_session");
  }

  if (matchedRepo.status !== "ready") {
    return toErrorRedirect(new URL(request.url), "repo_needs_access");
  }

  try {
    const project = await db.project.create({
      data: {
        repoName: matchedRepo.name,
        repoOwner: matchedRepo.owner,
        userId,
      },
    });

    return NextResponse.redirect(new URL(`/projects/${project.id}`, request.url), {
      status: 303,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existingProject = await db.project.findFirst({
        where: {
          repoName: matchedRepo.name,
          repoOwner: matchedRepo.owner,
          userId,
        },
      });

      if (existingProject) {
        const redirectUrl = new URL(`/projects/${existingProject.id}`, request.url);
        redirectUrl.searchParams.set("success", "already_imported");
        return NextResponse.redirect(redirectUrl, { status: 303 });
      }
    }

    throw error;
  }
}
