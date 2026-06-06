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
import { sandboxProvider } from "~/server/sandbox/provider";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: IssueSandboxRouteContext,
) {
  return withOwnedIssueSandboxRoute(request, context, async (access) => {
    const body = await readJsonObject(request);
    const sessionId = readStringField(body, "sessionId");
    const command = readStringField(body, "command");

    if (!command) return sandboxError("missing_command");

    const sessionError = await validateIssueSandboxSession(access, sessionId);

    if (sessionError) {
      return sessionError;
    }

    if (!sessionId) {
      return sandboxError("missing_session_id");
    }

    return respondWithSandboxToolAction(
      () => sandboxProvider.runCommand({ command, sessionId }),
      (result) => sandboxJson({ ok: true as const, ...result }),
      "Unable to run command.",
    );
  });
}
