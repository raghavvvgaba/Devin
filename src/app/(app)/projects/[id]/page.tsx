import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "~/components/app-shell";
import { db } from "~/server/db";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string }>;
};

export default async function ProjectPage({
  params,
  searchParams,
}: ProjectPageProps) {
  const { userId } = await auth();
  const { id } = await params;
  const query = await searchParams;
  const project = await db.project.findFirst({
    where: {
      id,
      userId: userId!,
    },
  });

  if (!project) {
    notFound();
  }

  return (
    <AppShell
      description="This imported project is now stored in the app and ready for the next phase, where live GitHub issues and file edits will land."
      title="Project"
    >
      <div className="space-y-6">
        {query.success === "already_imported" ? (
          <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 text-sm leading-7 text-emerald-800 shadow-sm">
            This repository was already imported, so you were redirected to the
            existing project.
          </div>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Imported repository
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              {project.repoOwner}/{project.repoName}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              Phase 3 successfully turned this GitHub repository into an app
              project. This page becomes the workspace for issues, edits,
              commits, and pull requests in the later phases.
            </p>
          </div>

          <div className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">
              Snapshot
            </p>
            <div className="mt-6 space-y-3">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-sm text-slate-300">Project ID</p>
                <p className="mt-2 text-base font-medium">{project.id}</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-sm text-slate-300">Imported on</p>
                <p className="mt-2 text-base font-medium">
                  {project.createdAt.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white/80 p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">
            Coming next
          </p>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight">
            Live issue fetching and project workspace details
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            The import is complete. The next phase will hydrate this view with
            live GitHub issues and repo-specific actions.
          </p>
          <Link
            className="mt-5 inline-flex rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold transition hover:border-slate-950"
            href="/dashboard"
          >
            Back to dashboard
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
