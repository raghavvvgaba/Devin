import { db } from "~/server/db";
import { clearGithubImportSession } from "~/server/github/import-session";

export async function getGithubConnectionStatus(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      githubConnected: true,
      githubConnectionReference: true,
      githubUsername: true,
    },
  });

  return {
    connected: Boolean(user?.githubConnected && user.githubUsername),
    githubConnectionReference: user?.githubConnectionReference ?? null,
    githubUsername: user?.githubUsername ?? null,
  };
}

export async function markGithubConnected(input: {
  userId: string;
  githubConnectionReference: string;
  githubUsername: string;
}) {
  return db.user.update({
    where: { id: input.userId },
    data: {
      githubConnected: true,
      githubConnectionReference: input.githubConnectionReference,
      githubUsername: input.githubUsername,
    },
  });
}

export async function disconnectGithub(userId: string) {
  await db.$transaction([
    db.project.deleteMany({
      where: { userId },
    }),
    db.user.update({
      where: { id: userId },
      data: {
        githubConnected: false,
        githubConnectionReference: null,
        githubUsername: null,
      },
    }),
  ]);

  await clearGithubImportSession();
}
