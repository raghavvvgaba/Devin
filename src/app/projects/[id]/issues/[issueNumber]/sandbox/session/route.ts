import {
  getOwnedIssueProject,
  sandboxError,
  sandboxJson,
  type IssueSandboxRouteContext,
} from "~/server/sandbox/route-helpers";
import { canAccessIssueSandbox } from "~/server/sandbox/ownership";
import { sandboxProvider } from "~/server/sandbox/provider";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: IssueSandboxRouteContext,
) {
  const access = await getOwnedIssueProject(request, context);

  if ("response" in access) {
    return access.response;
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId")?.trim();

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

  const session = sandboxProvider.get(sessionId);

  if (!session) {
    return sandboxError("session_not_found", 404);
  }

  return sandboxJson({ ok: true as const, session });
}
