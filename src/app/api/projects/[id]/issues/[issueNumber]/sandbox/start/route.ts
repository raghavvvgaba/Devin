import {
  respondWithSandboxAction,
  sandboxJson,
  type IssueSandboxRouteContext,
  withOwnedIssueSandboxRoute,
} from "~/server/sandbox/route-helpers";
import { sandboxProvider } from "~/server/sandbox/provider";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: IssueSandboxRouteContext,
) {
  return withOwnedIssueSandboxRoute(request, context, async (access) =>
    respondWithSandboxAction(
      () =>
        sandboxProvider.start({
          projectId: access.project.id,
          repoName: access.project.repoName,
          repoOwner: access.project.repoOwner,
          userId: access.userId,
        }),
      (session) => sandboxJson({ ok: true as const, session }),
      "Unable to start sandbox.",
    ),
  );
}
