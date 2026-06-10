import "server-only";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getOwnedProject } from "~/server/projects";
import { canAccessProjectSandbox } from "~/server/sandbox/ownership";

export type IssueSandboxRouteContext = {
  params: Promise<{ id: string; issueNumber: string }>;
};

export type ProjectSandboxRouteContext = {
  params: Promise<{ id: string }>;
};

export type OwnedIssueSandboxAccess = {
  issueNumber: number;
  project: NonNullable<Awaited<ReturnType<typeof getOwnedProject>>>;
  request: Request;
  userId: string;
};

export type OwnedProjectSandboxAccess = {
  project: NonNullable<Awaited<ReturnType<typeof getOwnedProject>>>;
  request: Request;
  userId: string;
};

export function sandboxJson<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function sandboxError(error: string, status = 400) {
  return sandboxJson({ ok: false as const, error }, { status });
}

export function sandboxToolError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const badRequestErrors = new Set([
    "command_not_allowed",
    "file_too_large",
    "invalid_path",
    "invalid_line_range",
    "missing_path",
    "missing_query",
  ]);

  return sandboxError(message, badRequestErrors.has(message) ? 400 : 500);
}

export async function getOwnedIssueProject(
  request: Request,
  context: IssueSandboxRouteContext,
) {
  const { userId } = await auth();

  if (!userId) {
    return {
      response: sandboxError("unauthenticated", 401),
    };
  }

  const { id, issueNumber: rawIssueNumber } = await context.params;
  const issueNumber = Number(rawIssueNumber);
  const project = await getOwnedProject(id, userId);

  if (!project || Number.isNaN(issueNumber)) {
    return {
      response: sandboxError("project_not_found", 404),
    };
  }

  return {
    issueNumber,
    project,
    request,
    userId,
  };
}

export async function getOwnedSandboxProject(
  request: Request,
  context: ProjectSandboxRouteContext,
) {
  const { userId } = await auth();

  if (!userId) {
    return {
      response: sandboxError("unauthenticated", 401),
    };
  }

  const { id } = await context.params;
  const project = await getOwnedProject(id, userId);

  if (!project) {
    return {
      response: sandboxError("project_not_found", 404),
    };
  }

  return {
    project,
    request,
    userId,
  };
}

export async function readJsonObject(request: Request) {
  try {
    const body = (await request.json()) as unknown;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }

    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readQueryStringField(request: Request, field: string) {
  return new URL(request.url).searchParams.get(field)?.trim() ?? null;
}

export function readStringField(
  body: Record<string, unknown> | null,
  field: string,
) {
  const value = body?.[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readOptionalStringField(
  body: Record<string, unknown> | null,
  field: string,
) {
  const value = body?.[field];
  return typeof value === "string" ? value : null;
}

export function readOptionalIntegerField(
  body: Record<string, unknown> | null,
  field: string,
) {
  if (!body || !(field in body)) {
    return undefined;
  }

  const value = body?.[field];

  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
}

export function readRequiredStringValue(
  body: Record<string, unknown> | null,
  field: string,
) {
  const value = body?.[field];
  return typeof value === "string" ? value : null;
}

export async function verifyIssueSandboxAccess(input: {
  projectId: string;
  sessionId: string;
  userId: string;
}) {
  return canAccessProjectSandbox(input.sessionId, {
    projectId: input.projectId,
    userId: input.userId,
  });
}

export async function withOwnedIssueSandboxRoute(
  request: Request,
  context: IssueSandboxRouteContext,
  handler: (access: OwnedIssueSandboxAccess) => Promise<Response> | Response,
) {
  const access = await getOwnedIssueProject(request, context);

  if ("response" in access) {
    return access.response;
  }

  return handler(access as OwnedIssueSandboxAccess);
}

export async function withOwnedProjectSandboxRoute(
  request: Request,
  context: ProjectSandboxRouteContext,
  handler: (access: OwnedProjectSandboxAccess) => Promise<Response> | Response,
) {
  const access = await getOwnedSandboxProject(request, context);

  if ("response" in access) {
    return access.response;
  }

  return handler(access as OwnedProjectSandboxAccess);
}

export async function validateProjectSandboxSession(
  access: OwnedProjectSandboxAccess,
  sessionId: string | null,
) {
  if (!sessionId) {
    return sandboxError("missing_session_id");
  }

  if (
    !(await canAccessProjectSandbox(sessionId, {
      projectId: access.project.id,
      userId: access.userId,
    }))
  ) {
    return sandboxError("session_not_found", 404);
  }

  return null;
}

export async function validateIssueSandboxSession(
  access: OwnedIssueSandboxAccess,
  sessionId: string | null,
) {
  if (!sessionId) {
    return sandboxError("missing_session_id");
  }

  if (
    !(await verifyIssueSandboxAccess({
      projectId: access.project.id,
      sessionId,
      userId: access.userId,
    }))
  ) {
    return sandboxError("session_not_found", 404);
  }

  return null;
}

export async function respondWithSandboxAction<T>(
  action: () => Promise<T>,
  buildSuccess: (value: T) => Response,
  fallback: string,
) {
  try {
    const value = await action();
    return buildSuccess(value);
  } catch (error) {
    return sandboxError(
      error instanceof Error ? error.message : fallback,
      500,
    );
  }
}

export async function respondWithSandboxToolAction<T>(
  action: () => Promise<T>,
  buildSuccess: (value: T) => Response,
  fallback: string,
) {
  try {
    const value = await action();
    return buildSuccess(value);
  } catch (error) {
    return sandboxToolError(error, fallback);
  }
}
