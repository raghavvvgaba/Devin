import "server-only";

import { db } from "~/server/db";
import type { SandboxSession as PublicSandboxSession } from "~/server/sandbox/types";

type PersistedSandboxSession = Awaited<
  ReturnType<typeof db.sandboxSession.findUnique>
>;

function toStoppedPublicSession(
  session: NonNullable<PersistedSandboxSession>,
): PublicSandboxSession {
  return {
    sessionId: session.sessionId,
    environmentId: session.sandboxId,
    previewUrl: session.previewUrl,
    status: "stopped",
    logs: ["Sandbox stopped.\n"],
    startedAt: session.startedAt.toISOString(),
    previewState: "offline",
    previewMessage: "Sandbox stopped.",
    startupMessage: "Sandbox stopped.",
  };
}

export async function getSandboxSessionRecordByProjectId(projectId: string) {
  return db.sandboxSession.findUnique({
    where: {
      projectId,
    },
  });
}

export async function getSandboxSessionRecordBySessionId(sessionId: string) {
  return db.sandboxSession.findUnique({
    where: {
      sessionId,
    },
  });
}

export async function createSandboxSessionRecord(input: {
  lastHeartbeatAt: Date;
  previewUrl: string;
  projectId: string;
  sandboxId: string;
  sessionId: string;
  startedAt: Date;
  userId: string;
}) {
  return db.$transaction(async (tx) => {
    await tx.sandboxSession.deleteMany({
      where: {
        projectId: input.projectId,
      },
    });

    return tx.sandboxSession.create({
      data: {
        lastHeartbeatAt: input.lastHeartbeatAt,
        previewUrl: input.previewUrl,
        projectId: input.projectId,
        sandboxId: input.sandboxId,
        sessionId: input.sessionId,
        startedAt: input.startedAt,
        userId: input.userId,
      },
    });
  });
}

export async function deleteSandboxSessionRecord(sessionId: string) {
  await db.sandboxSession.deleteMany({
    where: {
      sessionId,
    },
  });
}

export async function markSandboxSessionStopped(sessionId: string) {
  return db.sandboxSession.updateMany({
    data: {
      isStopped: true,
    },
    where: {
      sessionId,
    },
  });
}

export async function markSandboxSessionStoppedBySandboxId(sandboxId: string) {
  return db.sandboxSession.updateMany({
    data: {
      isStopped: true,
    },
    where: {
      sandboxId,
    },
  });
}

export async function touchSandboxSessionHeartbeat(
  sessionId: string,
  lastHeartbeatAt: Date,
) {
  return db.sandboxSession.updateMany({
    data: {
      isStopped: false,
      lastHeartbeatAt,
    },
    where: {
      sessionId,
    },
  });
}

export async function canAccessProjectSandboxSession(input: {
  projectId: string;
  sessionId: string;
  userId: string;
}) {
  const session = await db.sandboxSession.findFirst({
    select: {
      sessionId: true,
    },
    where: {
      projectId: input.projectId,
      sessionId: input.sessionId,
      userId: input.userId,
    },
  });

  return Boolean(session);
}

export async function getReusableProjectSandboxSession(input: {
  projectId: string;
  userId: string;
}) {
  return db.sandboxSession.findFirst({
    where: {
      isStopped: false,
      projectId: input.projectId,
      userId: input.userId,
    },
  });
}

export { toStoppedPublicSession };
