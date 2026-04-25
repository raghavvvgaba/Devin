import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { revalidateProjectGitHubReads } from "~/server/github/cache";
import { prepareSingleFileAiEdit } from "~/server/github/contents";
import { clearPostCommitResult } from "~/server/github/post-commit-session";
import { writePendingProjectEdit } from "~/server/github/pending-edit-session";
import { fetchProjectIssue } from "~/server/github/issues";
import { getOwnedProject } from "~/server/projects";

type EditRouteContext = {
  params: Promise<{ id: string; issueNumber: string }>;
};

function wantsJson(request: Request) {
  const accept = request.headers.get("accept") ?? "";
  const contentType = request.headers.get("content-type") ?? "";

  return (
    accept.includes("application/json") ||
    contentType.includes("application/json")
  );
}

function redirectToIssueWithStatus(
  request: Request,
  projectId: string,
  issueNumber: number,
  key: "error" | "success",
  value: string,
) {
  const redirectUrl = new URL(
    `/projects/${projectId}/issues/${issueNumber}`,
    request.url,
  );
  redirectUrl.searchParams.set(key, value);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}

function jsonError(code: string, status = 400) {
  return NextResponse.json(
    {
      code,
      status: "error" as const,
    },
    { status },
  );
}

async function getRequestedEditInput(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as {
      filePath?: unknown;
      instruction?: unknown;
    };

    return {
      filePath: typeof body.filePath === "string" ? body.filePath : null,
      instruction: typeof body.instruction === "string" ? body.instruction : null,
    };
  }

  const formData = await request.formData();
  const filePath = formData.get("filePath");
  const instruction = formData.get("instruction");

  return {
    filePath: typeof filePath === "string" ? filePath : null,
    instruction: typeof instruction === "string" ? instruction : null,
  };
}

async function handlePrepareEdit(request: Request, context: EditRouteContext) {
  const requestExpectsJson = wantsJson(request);
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    if (requestExpectsJson) {
      return jsonError("unauthenticated", 401);
    }
    return redirectToSignIn({ returnBackUrl: request.url });
  }

  const { id, issueNumber: rawIssueNumber } = await context.params;
  const issueNumber = Number(rawIssueNumber);
  const project = await getOwnedProject(id, userId);

  if (!project || Number.isNaN(issueNumber)) {
    if (requestExpectsJson) {
      return jsonError("project_not_found", 404);
    }
    return NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });
  }

  const { filePath: requestedFilePath, instruction: requestedInstruction } =
    await getRequestedEditInput(request);
  const filePath = requestedFilePath?.trim();
  const instruction = requestedInstruction?.trim();

  if (!filePath) {
    if (requestExpectsJson) {
      return jsonError("missing_file_path");
    }
    return redirectToIssueWithStatus(
      request,
      project.id,
      issueNumber,
      "error",
      "missing_file_path",
    );
  }

  if (!instruction) {
    if (requestExpectsJson) {
      return jsonError("missing_instruction");
    }
    return redirectToIssueWithStatus(
      request,
      project.id,
      issueNumber,
      "error",
      "missing_instruction",
    );
  }

  const issueResult = await fetchProjectIssue(
    project.repoOwner,
    project.repoName,
    issueNumber,
  );

  if (issueResult.status !== "ok") {
    if (requestExpectsJson) {
      return jsonError(
        issueResult.status === "missing_access"
          ? "edit_access_missing"
          : "issue_unavailable",
        issueResult.status === "missing_access" ? 403 : 400,
      );
    }
    return redirectToIssueWithStatus(
      request,
      project.id,
      issueNumber,
      "error",
      issueResult.status === "missing_access"
        ? "edit_access_missing"
        : "issue_unavailable",
    );
  }

  const preparedEdit = await prepareSingleFileAiEdit(
    project.repoOwner,
    project.repoName,
    filePath,
    issueResult.issue.title,
    instruction,
  );

  if (preparedEdit.status !== "ok") {
    if (requestExpectsJson) {
      if (preparedEdit.status === "missing_access") {
        return jsonError("edit_access_missing", 403);
      }

      if (preparedEdit.status === "missing_api_key") {
        return jsonError("edit_ai_unavailable", 503);
      }

      if (preparedEdit.status === "file_not_found") {
        return jsonError("file_not_found", 404);
      }

      if (preparedEdit.status === "unsupported_file") {
        return jsonError("unsupported_file");
      }

      if (preparedEdit.status === "no_changes") {
        return jsonError("edit_no_changes");
      }

      if (preparedEdit.status === "invalid_response") {
        return jsonError("edit_invalid_response");
      }

      return jsonError(
        preparedEdit.status === "model_error"
          ? "edit_generation_failed"
          : "edit_prepare_failed",
        500,
      );
    }

    if (preparedEdit.status === "missing_access") {
      return redirectToIssueWithStatus(
        request,
        project.id,
        issueNumber,
        "error",
        "edit_access_missing",
      );
    }

    if (preparedEdit.status === "missing_api_key") {
      return redirectToIssueWithStatus(
        request,
        project.id,
        issueNumber,
        "error",
        "edit_ai_unavailable",
      );
    }

    if (preparedEdit.status === "file_not_found") {
      return redirectToIssueWithStatus(
        request,
        project.id,
        issueNumber,
        "error",
        "file_not_found",
      );
    }

    if (preparedEdit.status === "unsupported_file") {
      return redirectToIssueWithStatus(
        request,
        project.id,
        issueNumber,
        "error",
        "unsupported_file",
      );
    }

    if (preparedEdit.status === "no_changes") {
      return redirectToIssueWithStatus(
        request,
        project.id,
        issueNumber,
        "error",
        "edit_no_changes",
      );
    }

    if (preparedEdit.status === "invalid_response") {
      return redirectToIssueWithStatus(
        request,
        project.id,
        issueNumber,
        "error",
        "edit_invalid_response",
      );
    }

    return redirectToIssueWithStatus(
      request,
      project.id,
      issueNumber,
      "error",
      preparedEdit.status === "model_error"
        ? "edit_generation_failed"
        : "edit_prepare_failed",
    );
  }

  await clearPostCommitResult(project.id, issueNumber);
  await writePendingProjectEdit({
    filePath: preparedEdit.filePath,
    issueNumber,
    issueTitle: issueResult.issue.title,
    model: preparedEdit.model,
    originalContent: preparedEdit.originalContent,
    originalSha: preparedEdit.originalSha,
    projectId: project.id,
    repoName: project.repoName,
    repoOwner: project.repoOwner,
    summary: preparedEdit.summary,
    updatedContent: preparedEdit.updatedContent,
    userInstruction: instruction,
  });
  revalidateProjectGitHubReads({
    issueNumber,
    repoName: project.repoName,
    repoOwner: project.repoOwner,
  });

  if (requestExpectsJson) {
    return NextResponse.json({
      pendingEdit: {
        filePath: preparedEdit.filePath,
        model: preparedEdit.model,
        originalContent: preparedEdit.originalContent,
        summary: preparedEdit.summary,
        updatedContent: preparedEdit.updatedContent,
        userInstruction: instruction,
      },
      status: "ok" as const,
    });
  }

  return redirectToIssueWithStatus(
    request,
    project.id,
    issueNumber,
    "success",
    "edit_prepared",
  );
}

export async function PUT(request: Request, context: EditRouteContext) {
  return handlePrepareEdit(request, context);
}

export async function POST(request: Request, context: EditRouteContext) {
  return handlePrepareEdit(request, context);
}
