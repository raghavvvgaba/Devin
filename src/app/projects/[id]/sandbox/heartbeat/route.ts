import {
  getOwnedSandboxProject,
  readJsonObject,
  readStringField,
  sandboxError,
  sandboxJson,
  type ProjectSandboxRouteContext,
} from "~/server/sandbox/route-helpers";
import { canAccessProjectSandbox } from "~/server/sandbox/ownership";
import { sandboxProvider } from "~/server/sandbox/provider";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  request: Request,
  context: ProjectSandboxRouteContext,
) {
  const access = await getOwnedSandboxProject(request, context);

  if ("response" in access) {
    return access.response;
  }

  const body = await readJsonObject(request);
  const sessionId = readStringField(body, "sessionId");

  if (!sessionId) {
    return sandboxError("missing_session_id");
  }

  if (
    !canAccessProjectSandbox(sessionId, {
      projectId: access.project.id,
      userId: access.userId,
    })
  ) {
    return sandboxError("session_not_found", 404);
  }

  const session = sandboxProvider.heartbeat(sessionId);

  if (!session) {
    return sandboxError("session_not_found", 404);
  }

  return sandboxJson({ ok: true as const, session });
}
