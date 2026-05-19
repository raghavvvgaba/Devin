import "server-only";

type IssueSandboxOwner = {
  issueNumber: number;
  projectId: string;
  userId: string;
};

declare global {
  var __issueSandboxSessionOwners: Map<string, IssueSandboxOwner> | undefined;
}

const issueSandboxOwners =
  globalThis.__issueSandboxSessionOwners ?? new Map<string, IssueSandboxOwner>();
globalThis.__issueSandboxSessionOwners = issueSandboxOwners;

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
