import { auth } from "@clerk/nextjs/server";
import { Prisma } from "../../../../generated/prisma";
import { NextResponse } from "next/server";

import { ensureUserRecord } from "~/server/auth/sync-user";
import { db } from "~/server/db";
import { getGithubConnectionStatus } from "~/server/github/connection";
import { readGithubImportSession } from "~/server/github/import-session";
import { fetchImportRepositories } from "~/server/github/repos";
import { listProjectsForUser } from "~/server/projects";

function toErrorRedirect(url: URL, error: string) {
  const redirectUrl = new URL("/projects/new", url);
  redirectUrl.searchParams.set("error", error);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}

function wantsJson(request: Request) {
  return request.headers.get("accept")?.includes("application/json") ?? false;
}

function toImportError(request: Request, error: string, status = 400) {
  if (wantsJson(request)) {
    return NextResponse.json({ error }, { status });
  }

  return toErrorRedirect(new URL(request.url), error);
}

function toImportSuccess(request: Request, projectId: string) {
  const projectUrl = `/projects/${projectId}`;

  if (wantsJson(request)) {
    return NextResponse.json({ projectUrl });
  }

  return NextResponse.redirect(new URL(projectUrl, request.url), {
    status: 303,
  });
}

export async function GET() {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn({ returnBackUrl: "/dashboard" });
  }

  const projects = await listProjectsForUser(userId);

  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn({ returnBackUrl: "/projects/new" });
  }

  const githubStatus = await getGithubConnectionStatus(userId);

  if (!githubStatus.connected) {
    return toImportError(request, "github_required", 403);
  }

  const formData = await request.formData();
  const repoOwner = formData.get("repoOwner");
  const repoName = formData.get("repoName");

  if (typeof repoOwner !== "string" || typeof repoName !== "string") {
    return toImportError(request, "missing_repo_selection");
  }

  const importSession = await readGithubImportSession();

  if (!importSession) {
    return toImportError(request, "refresh_import_session", 401);
  }

  const repos = await fetchImportRepositories(importSession.accessToken);
  const matchedRepo = repos.find(
    (repo) =>
      repo.owner.toLowerCase() === repoOwner.toLowerCase() &&
      repo.name.toLowerCase() === repoName.toLowerCase(),
  );

  if (!matchedRepo) {
    return toImportError(request, "repo_not_in_session", 404);
  }

  if (matchedRepo.status !== "ready") {
    return toImportError(request, "repo_needs_access", 403);
  }

  try {
    await ensureUserRecord(userId);
    const project = await db.project.create({
      data: {
        repoName: matchedRepo.name,
        repoOwner: matchedRepo.owner,
        userId,
      },
    });

    return toImportSuccess(request, project.id);
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
        return toImportSuccess(request, existingProject.id);
      }
    }

    throw error;
  }
}
