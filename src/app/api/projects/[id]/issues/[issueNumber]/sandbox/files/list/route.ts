import {
  getOwnedIssueProject,
  readJsonObject,
  readOptionalStringField,
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
  const path = readOptionalStringField(body, "path") ?? "";

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
    const entries = await sandboxProvider.listFiles({ path, sessionId });
    return sandboxJson({ ok: true as const, entries });
  } catch (error) {
    return sandboxToolError(error, "Unable to list files.");
  }
}
