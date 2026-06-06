import {
  readJsonObject,
  readStringField,
  sandboxError,
  respondWithSandboxAction,
  sandboxJson,
  type ProjectSandboxRouteContext,
  validateProjectSandboxSession,
  withOwnedProjectSandboxRoute,
} from "~/server/sandbox/route-helpers";
import { sandboxProvider } from "~/server/sandbox/provider";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: ProjectSandboxRouteContext,
) {
  return withOwnedProjectSandboxRoute(request, context, async (access) => {
    const body = await readJsonObject(request);
    const sessionId = readStringField(body, "sessionId");
    const environmentId = readStringField(body, "environmentId") ?? undefined;
    const sessionError = await validateProjectSandboxSession(access, sessionId);

    if (sessionError) {
      return sessionError;
    }

    if (!sessionId) {
      return sandboxError("missing_session_id");
    }

    return respondWithSandboxAction(
      () => sandboxProvider.stop({ environmentId, sessionId }),
      (session) => sandboxJson({ ok: true as const, session }),
      "Unable to stop sandbox.",
    );
  });
}
