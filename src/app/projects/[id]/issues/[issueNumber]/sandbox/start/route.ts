import {
  getOwnedIssueProject,
  sandboxError,
  sandboxJson,
  type IssueSandboxRouteContext,
} from "~/server/sandbox/route-helpers";
import { recordIssueSandboxOwner } from "~/server/sandbox/ownership";
import { sandboxProvider } from "~/server/sandbox/provider";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: IssueSandboxRouteContext,
) {
  const access = await getOwnedIssueProject(request, context);

  if ("response" in access) {
    return access.response;
  }

  try {
    const session = await sandboxProvider.start();
    recordIssueSandboxOwner(session.sessionId, {
      issueNumber: access.issueNumber,
      projectId: access.project.id,
      userId: access.userId,
    });
    return sandboxJson({ ok: true as const, session });
  } catch (error) {
    return sandboxError(
      error instanceof Error ? error.message : "Unable to start sandbox.",
      500,
    );
  }
}
