import {
  readOptionalIntegerField,
  readJsonObject,
  readStringField,
  sandboxError,
  sandboxJson,
  respondWithSandboxToolAction,
  type IssueSandboxRouteContext,
  validateIssueSandboxSession,
  withOwnedIssueSandboxRoute,
} from "~/server/sandbox/route-helpers";
import { readSandboxFile } from "~/server/sandbox/tools/read-file";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: IssueSandboxRouteContext,
) {
  return withOwnedIssueSandboxRoute(request, context, async (access) => {
    const body = await readJsonObject(request);
    const sessionId = readStringField(body, "sessionId");
    const path = readStringField(body, "path");
    const startLine = readOptionalIntegerField(body, "startLine");
    const endLine = readOptionalIntegerField(body, "endLine");

    if (!path) return sandboxError("missing_path");
    if (startLine === null || endLine === null) {
      return sandboxError("invalid_line_range");
    }

    const sessionError = await validateIssueSandboxSession(access, sessionId);

    if (sessionError) {
      return sessionError;
    }

    if (!sessionId) {
      return sandboxError("missing_session_id");
    }

    return respondWithSandboxToolAction(
      () =>
        readSandboxFile({
          endLine,
          path,
          sessionId,
          startLine,
        }),
      (file) => sandboxJson({ ok: true as const, file }),
      "Unable to read file.",
    );
  });
}
