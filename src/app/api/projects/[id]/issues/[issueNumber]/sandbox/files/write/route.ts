import {
  getOwnedIssueProject,
  readJsonObject,
  readRequiredStringValue,
  readStringField,
  sandboxError,
  sandboxJson,
  sandboxToolError,
  type IssueSandboxRouteContext,
  verifyIssueSandboxAccess,
} from "~/server/sandbox/route-helpers";
import { sandboxProvider } from "~/server/sandbox/provider";

export const runtime = "nodejs";
export const maxDuration = 120;

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
  const content = readRequiredStringValue(body, "content");

  if (!sessionId) return sandboxError("missing_session_id");
  if (!path) return sandboxError("missing_path");
  if (content === null) return sandboxError("missing_content");

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
    const result = await sandboxProvider.writeFile({ content, path, sessionId });
    return sandboxJson({ ok: true as const, file: { path: result.path }, session: result.session });
  } catch (error) {
    return sandboxToolError(error, "Unable to write file.");
  }
}
