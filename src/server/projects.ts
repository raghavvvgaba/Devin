import { db } from "~/server/db";

export async function getOwnedProject(projectId: string, userId: string) {
  return db.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
  });
}

export async function listProjectsForUser(userId: string) {
  return db.project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listImportedProjectsForUser(userId: string) {
  return db.project.findMany({
    where: { userId },
    select: {
      id: true,
      repoName: true,
      repoOwner: true,
    },
  });
}
