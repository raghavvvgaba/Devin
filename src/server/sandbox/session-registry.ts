import "server-only";

/** Stores and retrieves persisted sandbox session records in the database. */

import { db } from "~/server/db";
import type { SandboxSession as PublicSandboxSession } from "~/server/sandbox/types";

type PersistedSandboxSession = Awaited<
  ReturnType<typeof db.sandboxSession.findUnique>
>;

/** Converts a persisted record into the stopped public session shape. */
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

/** Finds the sandbox session record attached to a project. */
export async function getSandboxSessionRecordByProjectId(projectId: string) {
  return db.sandboxSession.findUnique({
    where: {
      projectId,
    },
  });
}

/** Finds a sandbox session record by session id. */
export async function getSandboxSessionRecordBySessionId(sessionId: string) {
  return db.sandboxSession.findUnique({
    where: {
      sessionId,
    },
  });
}

/** Replaces any existing project session with a newly created sandbox session record. */
export async function createSandboxSessionRecord(input: {
  lastHeartbeatAt: Date;
  previewUrl: string;
  projectId: string;
  sandboxId: string;
  sessionId: string;
  startedAt: Date;
  userId: string;
}) {
  return db.sandboxSession.upsert({
    create: {
      lastHeartbeatAt: input.lastHeartbeatAt,
      previewUrl: input.previewUrl,
      projectId: input.projectId,
      sandboxId: input.sandboxId,
      sessionId: input.sessionId,
      startedAt: input.startedAt,
      userId: input.userId,
    },
    update: {
      isStopped: false,
      lastHeartbeatAt: input.lastHeartbeatAt,
      previewUrl: input.previewUrl,
      sandboxId: input.sandboxId,
      sessionId: input.sessionId,
      startedAt: input.startedAt,
      userId: input.userId,
    },
    where: {
      projectId: input.projectId,
    },
  });
}

/** Deletes sandbox session records for the given session id. */
export async function deleteSandboxSessionRecord(sessionId: string) {
  await db.sandboxSession.deleteMany({
    where: {
      sessionId,
    },
  });
}

/** Marks a sandbox session as stopped without deleting the record. */
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

/** Marks sandbox sessions as stopped by sandbox id. */
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

/** Updates the last heartbeat timestamp and marks the session active. */
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

/** Checks whether a user owns the requested project sandbox session. */
export async function canAccessProjectSandboxSession(input: {
  projectId: string;
  sessionId: string;
  userId: string;
}) {
  const session = await db.sandboxSession.findUnique({
    select: {
      sessionId: true,
      userId: true,
    },
    where: {
      projectId: input.projectId,
    },
  });

  return Boolean(
    session &&
      session.sessionId === input.sessionId &&
      session.userId === input.userId,
  );
}

/** Returns the active reusable sandbox session for a project, if one exists. */
export async function getReusableProjectSandboxSession(input: {
  projectId: string;
  userId: string;
}) {
  const session = await db.sandboxSession.findUnique({
    where: {
      projectId: input.projectId,
    },
  });

  if (!session || session.userId !== input.userId || session.isStopped) {
    return null;
  }

  return session;
}

export { toStoppedPublicSession };
