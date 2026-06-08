import {
  readJsonObject,
  readStringField,
  sandboxError,
  sandboxJson,
  respondWithSandboxToolAction,
  type IssueSandboxRouteContext,
  validateIssueSandboxSession,
  withOwnedIssueSandboxRoute,
} from "~/server/sandbox/route-helpers";
import { getSandboxDiff } from "~/server/sandbox/tools/diff";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: IssueSandboxRouteContext,
) {
  return withOwnedIssueSandboxRoute(request, context, async (access) => {
    const body = await readJsonObject(request);
    const sessionId = readStringField(body, "sessionId");
    const sessionError = await validateIssueSandboxSession(access, sessionId);

    if (sessionError) {
      return sessionError;
    }

    if (!sessionId) {
      return sandboxError("missing_session_id");
    }

    return respondWithSandboxToolAction(
      () => getSandboxDiff({ sessionId }),
      (diff) => sandboxJson({ ok: true as const, diff }),
      "Unable to get diff.",
    );
  });
}
