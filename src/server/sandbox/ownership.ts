import "server-only";

import {
  canAccessProjectSandboxSession,
  getSandboxSessionRecordByProjectId,
  markSandboxSessionStopped,
} from "~/server/sandbox/session-registry";

export async function recordIssueSandboxOwner() {
  return;
}

export async function clearIssueSandboxOwner(sessionId: string) {
  await markSandboxSessionStopped(sessionId);
}

export async function canAccessIssueSandbox(
  sessionId: string,
  owner: {
    issueNumber: number;
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

export async function recordProjectSandboxOwner() {
  return;
}

export async function clearProjectSandboxOwner(sessionId: string) {
  await markSandboxSessionStopped(sessionId);
}

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

export async function getProjectSandboxSession(projectId: string) {
  return getSandboxSessionRecordByProjectId(projectId);
}
