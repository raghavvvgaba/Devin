import "server-only";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getOwnedProject } from "~/server/projects";
import { canAccessIssueSandbox } from "~/server/sandbox/ownership";

export type IssueSandboxRouteContext = {
  params: Promise<{ id: string; issueNumber: string }>;
};

export type ProjectSandboxRouteContext = {
  params: Promise<{ id: string }>;
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

export function verifyIssueSandboxAccess(input: {
  issueNumber: number;
  projectId: string;
  sessionId: string;
  userId: string;
}) {
  return canAccessIssueSandbox(input.sessionId, {
    issueNumber: input.issueNumber,
    projectId: input.projectId,
    userId: input.userId,
  });
}
