import {
  readQueryStringField,
  sandboxError,
  sandboxJson,
  type ProjectSandboxRouteContext,
  validateProjectSandboxSession,
  withOwnedProjectSandboxRoute,
} from "~/server/sandbox/route-helpers";
import { sandboxProvider } from "~/server/sandbox/provider";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: ProjectSandboxRouteContext,
) {
  return withOwnedProjectSandboxRoute(request, context, async (access) => {
    const sessionId = readQueryStringField(request, "sessionId");
    const sessionError = await validateProjectSandboxSession(access, sessionId);

    if (sessionError) {
      return sessionError;
    }

    if (!sessionId) {
      return sandboxError("missing_session_id");
    }

    const session = await sandboxProvider.get(sessionId);

    if (!session) {
      return sandboxError("session_not_found", 404);
    }

    return sandboxJson({ ok: true as const, session });
  });
}
