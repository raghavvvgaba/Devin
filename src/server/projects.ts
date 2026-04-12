import { db } from "~/server/db";

export async function getOwnedProject(projectId: string, userId: string) {
  return db.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
  });
}
