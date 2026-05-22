import "server-only";

type IssueSandboxOwner = {
  issueNumber: number;
  projectId: string;
  userId: string;
};

type ProjectSandboxOwner = {
  projectId: string;
  userId: string;
};

declare global {
  var __issueSandboxSessionOwners: Map<string, IssueSandboxOwner> | undefined;
  var __projectSandboxSessionOwners:
    | Map<string, ProjectSandboxOwner>
    | undefined;
}

const issueSandboxOwners =
  globalThis.__issueSandboxSessionOwners ?? new Map<string, IssueSandboxOwner>();
globalThis.__issueSandboxSessionOwners = issueSandboxOwners;

const projectSandboxOwners =
  globalThis.__projectSandboxSessionOwners ??
  new Map<string, ProjectSandboxOwner>();
globalThis.__projectSandboxSessionOwners = projectSandboxOwners;

export function recordIssueSandboxOwner(
  sessionId: string,
  owner: IssueSandboxOwner,
) {
  issueSandboxOwners.set(sessionId, owner);
}

export function clearIssueSandboxOwner(sessionId: string) {
  issueSandboxOwners.delete(sessionId);
}

export function canAccessIssueSandbox(
  sessionId: string,
  owner: IssueSandboxOwner,
) {
  const recordedOwner = issueSandboxOwners.get(sessionId);

  if (!recordedOwner) return false;

  return (
    recordedOwner.issueNumber === owner.issueNumber &&
    recordedOwner.projectId === owner.projectId &&
    recordedOwner.userId === owner.userId
  );
}

export function recordProjectSandboxOwner(
  sessionId: string,
  owner: ProjectSandboxOwner,
) {
  projectSandboxOwners.set(sessionId, owner);
}

export function clearProjectSandboxOwner(sessionId: string) {
  projectSandboxOwners.delete(sessionId);
}

export function canAccessProjectSandbox(
  sessionId: string,
  owner: ProjectSandboxOwner,
) {
  const recordedOwner = projectSandboxOwners.get(sessionId);

  if (!recordedOwner) return false;

  return (
    recordedOwner.projectId === owner.projectId &&
    recordedOwner.userId === owner.userId
  );
}
