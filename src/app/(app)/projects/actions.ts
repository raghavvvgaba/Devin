"use server";

import { revalidateTag } from "next/cache";

import type { RepoImportItem } from "~/lib/github-types";
import { getAuth } from "~/server/auth/session";
import { getGithubConnectionStatus } from "~/server/github/connection";
import {
  getImportRepositoriesTag,
  hashGithubImportToken,
} from "~/server/github/cache";
import { readGithubImportSession } from "~/server/github/import-session";
import { fetchImportRepositories, fetchGithubViewerLogin } from "~/server/github/repos";
import { listImportedProjectsForUser } from "~/server/projects";

export type ImportModalData =
  | { status: "github_disconnected" }
  | { status: "session_required" }
  | { message: string; status: "error" }
  | {
      importedProjects: Record<string, string>;
      repositories: RepoImportItem[];
      status: "ready";
      viewerLogin: string;
    };

export async function fetchImportModalData(
  options: { refresh?: boolean } = {},
): Promise<ImportModalData> {
  const { userId } = await getAuth();

  if (!userId) {
    return {
      message: "Your session has expired. Sign in again to import repositories.",
      status: "error",
    };
  }

  const githubStatus = await getGithubConnectionStatus(userId);

  if (!githubStatus.connected) {
    return { status: "github_disconnected" };
  }

  const importSession = await readGithubImportSession();

  if (!importSession) {
    return { status: "session_required" };
  }

  if (options.refresh) {
    revalidateTag(
      getImportRepositoriesTag(
        hashGithubImportToken(importSession.accessToken),
      ),
    );
  }

  try {
    const [importedProjects, repositories, viewerLogin] = await Promise.all([
      listImportedProjectsForUser(userId),
      fetchImportRepositories(importSession.accessToken),
      fetchGithubViewerLogin(importSession.accessToken),
    ]);

    return {
      importedProjects: Object.fromEntries(
        importedProjects.map((project) => [
          `${project.repoOwner.toLowerCase()}/${project.repoName.toLowerCase()}`,
          project.id,
        ]),
      ),
      repositories,
      status: "ready",
      viewerLogin,
    };
  } catch {
    return {
      message:
        "GitHub did not return the repository list. Refresh access and try again.",
      status: "error",
    };
  }
}
