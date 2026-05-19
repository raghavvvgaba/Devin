import "server-only";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getOwnedProject } from "~/server/projects";

export type IssueSandboxRouteContext = {
  params: Promise<{ id: string; issueNumber: string }>;
};

export function sandboxJson<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function sandboxError(error: string, status = 400) {
  return sandboxJson({ ok: false as const, error }, { status });
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
