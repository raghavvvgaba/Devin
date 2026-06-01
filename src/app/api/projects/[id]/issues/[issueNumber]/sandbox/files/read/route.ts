import {
  getOwnedIssueProject,
  readOptionalIntegerField,
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
  const path = readStringField(body, "path");
  const startLine = readOptionalIntegerField(body, "startLine");
  const endLine = readOptionalIntegerField(body, "endLine");

  if (!sessionId) return sandboxError("missing_session_id");
  if (!path) return sandboxError("missing_path");
  if (startLine === null || endLine === null) {
    return sandboxError("invalid_line_range");
  }

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
    const file = await sandboxProvider.readFile({
      endLine,
      path,
      sessionId,
      startLine,
    });
    return sandboxJson({ ok: true as const, file });
  } catch (error) {
    return sandboxToolError(error, "Unable to read file.");
  }
}
