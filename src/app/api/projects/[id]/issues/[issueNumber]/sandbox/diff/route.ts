import {
  getOwnedIssueProject,
  readJsonObject,
  readStringField,
  sandboxError,
  sandboxJson,
  sandboxToolError,
  type IssueSandboxRouteContext,
  verifyIssueSandboxAccess,
} from "~/server/sandbox/route-helpers";
import { sandboxProvider } from "~/server/sandbox/provider";

export const runtime = "nodejs";

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

  if (!sessionId) return sandboxError("missing_session_id");

  if (
    !verifyIssueSandboxAccess({
      issueNumber: access.issueNumber,
      projectId: access.project.id,
      sessionId,
      userId: access.userId,
    })
  ) {
    return sandboxError("session_not_found", 404);
  }

  try {
    const diff = await sandboxProvider.getDiff({ sessionId });
    return sandboxJson({ ok: true as const, diff });
  } catch (error) {
    return sandboxToolError(error, "Unable to get diff.");
  }
}
