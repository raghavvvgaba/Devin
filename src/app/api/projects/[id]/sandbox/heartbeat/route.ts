import {
  readJsonObject,
  readStringField,
  sandboxError,
  sandboxJson,
  type ProjectSandboxRouteContext,
  validateProjectSandboxSession,
  withOwnedProjectSandboxRoute,
} from "~/server/sandbox/route-helpers";
import { sandboxProvider } from "~/server/sandbox/provider";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  request: Request,
  context: ProjectSandboxRouteContext,
) {
  return withOwnedProjectSandboxRoute(request, context, async (access) => {
    const body = await readJsonObject(request);
    const sessionId = readStringField(body, "sessionId");
    const sessionError = await validateProjectSandboxSession(access, sessionId);

    if (sessionError) {
      return sessionError;
    }

    if (!sessionId) {
      return sandboxError("missing_session_id");
    }

    const session = await sandboxProvider.heartbeat(sessionId);

    if (!session) {
      return sandboxJson({ ok: false as const, error: "session_not_found" }, { status: 404 });
    }

    return sandboxJson({ ok: true as const, session });
  });
}
