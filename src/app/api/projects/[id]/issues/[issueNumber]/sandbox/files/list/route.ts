import {
  readJsonObject,
  readOptionalStringField,
  readStringField,
  sandboxError,
  sandboxJson,
  respondWithSandboxToolAction,
  type IssueSandboxRouteContext,
  validateIssueSandboxSession,
  withOwnedIssueSandboxRoute,
} from "~/server/sandbox/route-helpers";
import { listSandboxFiles } from "~/server/sandbox/tools/list-directory";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: IssueSandboxRouteContext,
) {
  return withOwnedIssueSandboxRoute(request, context, async (access) => {
    const body = await readJsonObject(request);
    const sessionId = readStringField(body, "sessionId");
    const path = readOptionalStringField(body, "path") ?? "";
    const sessionError = await validateIssueSandboxSession(access, sessionId);

    if (sessionError) {
      return sessionError;
    }

    if (!sessionId) {
      return sandboxError("missing_session_id");
    }

    return respondWithSandboxToolAction(
      () => listSandboxFiles({ path, sessionId }),
      (entries) => sandboxJson({ ok: true as const, entries }),
      "Unable to list files.",
    );
  });
}
