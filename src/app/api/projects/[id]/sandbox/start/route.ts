import {
  getOwnedSandboxProject,
  sandboxError,
  sandboxJson,
  type ProjectSandboxRouteContext,
} from "~/server/sandbox/route-helpers";
import { recordProjectSandboxOwner } from "~/server/sandbox/ownership";
import { sandboxProvider } from "~/server/sandbox/provider";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: ProjectSandboxRouteContext,
) {
  const access = await getOwnedSandboxProject(request, context);

  if ("response" in access) {
    return access.response;
  }

  try {
    const session = await sandboxProvider.start({
      repoName: access.project.repoName,
      repoOwner: access.project.repoOwner,
    });
    recordProjectSandboxOwner(session.sessionId, {
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
