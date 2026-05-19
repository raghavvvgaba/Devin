import {
  getOwnedIssueProject,
  readJsonObject,
  readStringField,
  sandboxError,
  sandboxJson,
  type IssueSandboxRouteContext,
} from "~/server/sandbox/route-helpers";
import {
  canAccessIssueSandbox,
  clearIssueSandboxOwner,
} from "~/server/sandbox/ownership";
import { sandboxProvider } from "~/server/sandbox/provider";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: IssueSandboxRouteContext,
) {
  const access = await getOwnedIssueProject(request, context);

  if ("response" in access) {
    return access.response;
  }

  const body = await readJsonObject(request);
  const sessionId = readStringField(body, "sessionId");
  const environmentId = readStringField(body, "environmentId") ?? undefined;

  if (!sessionId) {
    return sandboxError("missing_session_id");
  }

  if (
    !canAccessIssueSandbox(sessionId, {
      issueNumber: access.issueNumber,
      projectId: access.project.id,
      userId: access.userId,
    })
  ) {
    return sandboxError("session_not_found", 404);
  }

  try {
    const session = await sandboxProvider.stop({ environmentId, sessionId });
    clearIssueSandboxOwner(sessionId);
    return sandboxJson({ ok: true as const, session });
  } catch (error) {
    return sandboxError(
      error instanceof Error ? error.message : "Unable to stop sandbox.",
      500,
    );
  }
}
