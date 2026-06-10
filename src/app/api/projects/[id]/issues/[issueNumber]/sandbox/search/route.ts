import {
  readJsonObject,
  readOptionalStringField,
  readStringField,
  sandboxJson,
  respondWithSandboxToolAction,
  type IssueSandboxRouteContext,
  validateIssueSandboxSession,
  withOwnedIssueSandboxRoute,
} from "~/server/sandbox/route-helpers";
import { searchSandboxCode } from "~/server/sandbox/tools/search-code";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: IssueSandboxRouteContext,
) {
  return withOwnedIssueSandboxRoute(request, context, async (access) => {
    const body = await readJsonObject(request);
    const sessionId = readStringField(body, "sessionId");
    const query = readStringField(body, "query");
    const path = readOptionalStringField(body, "path") ?? "";
    const sessionError = await validateIssueSandboxSession(access, sessionId);

    if (sessionError) {
      return sessionError;
    }

    return respondWithSandboxToolAction(
      () =>
        searchSandboxCode({
          path,
          query: query ?? "",
          sessionId: sessionId ?? "",
        }),
      (result) =>
        sandboxJson({
          ok: true as const,
          caps: result.caps,
          matches: result.matches,
          truncated: result.truncated,
        }),
      "Unable to search code.",
    );
  });
}
