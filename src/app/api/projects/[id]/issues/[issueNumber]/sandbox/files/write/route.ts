import {
  readJsonObject,
  readRequiredStringValue,
  readStringField,
  sandboxError,
  sandboxJson,
  respondWithSandboxToolAction,
  type IssueSandboxRouteContext,
  validateIssueSandboxSession,
  withOwnedIssueSandboxRoute,
} from "~/server/sandbox/route-helpers";
import { writeSandboxFile } from "~/server/sandbox/tools/write-file";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  request: Request,
  context: IssueSandboxRouteContext,
) {
  return withOwnedIssueSandboxRoute(request, context, async (access) => {
    const body = await readJsonObject(request);
    const sessionId = readStringField(body, "sessionId");
    const path = readStringField(body, "path");
    const content = readRequiredStringValue(body, "content");

    if (!path) return sandboxError("missing_path");
    if (content === null) return sandboxError("missing_content");

    const sessionError = await validateIssueSandboxSession(access, sessionId);

    if (sessionError) {
      return sessionError;
    }

    if (!sessionId) {
      return sandboxError("missing_session_id");
    }

    return respondWithSandboxToolAction(
      () => writeSandboxFile({ content, path, sessionId }),
      (result) =>
        sandboxJson({
          ok: true as const,
          file: { path: result.path },
          session: result.session,
        }),
      "Unable to write file.",
    );
  });
}
