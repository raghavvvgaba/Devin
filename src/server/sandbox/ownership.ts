import "server-only";

/** Wraps project-based sandbox access and cleanup helpers. */

import {
  canAccessProjectSandboxSession,
  getSandboxSessionRecordByProjectId,
  markSandboxSessionStopped,
} from "~/server/sandbox/session-registry";

/** Marks a project sandbox session as stopped when ownership is cleared. */
export async function clearProjectSandboxOwner(sessionId: string) {
  await markSandboxSessionStopped(sessionId);
}

/** Checks whether a user can access the given project sandbox session. */
export async function canAccessProjectSandbox(
  sessionId: string,
  owner: {
    projectId: string;
    userId: string;
  },
) {
  return canAccessProjectSandboxSession({
    projectId: owner.projectId,
    sessionId,
    userId: owner.userId,
  });
}

/** Looks up the stored sandbox session record for a project. */
export async function getProjectSandboxSession(projectId: string) {
  return getSandboxSessionRecordByProjectId(projectId);
}
