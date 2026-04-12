import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "~/components/app-shell";
import { env } from "~/env";
import { fetchProjectOpenIssues } from "~/server/github/issues";
import { getOwnedProject } from "~/server/projects";

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
  const project = await getOwnedProject(id, userId!);

  if (!project) {
    notFound();
  }

  const issuesResult = await fetchProjectOpenIssues(
    project.repoOwner,
    project.repoName,
  );

  return (
    <AppShell
      description="This imported project now loads live open GitHub issues so the workspace can reflect real repository context."
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
              This repository is now live inside the app. Open GitHub issues are
              fetched on demand, while the project record stays minimal in
              Prisma.
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
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-sm text-slate-300">Open issues shown</p>
                <p className="mt-2 text-base font-medium">
                  {issuesResult.status === "ok" ? issuesResult.issues.length : 0} / 10
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">
                Open issues
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                Live repository context
              </h3>
            </div>
            <Link
              className="inline-flex rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold transition hover:border-slate-950"
              href="/dashboard"
            >
              Back to dashboard
            </Link>
          </div>

          {issuesResult.status === "missing_access" ? (
            <div className="mt-6 rounded-[2rem] border border-amber-200 bg-amber-50 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
                Access needed
              </p>
              <h4 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
                The GitHub App no longer has repository access
              </h4>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-700">
                Issues cannot load until the GitHub App is granted access to
                this repository again. Use GitHub&apos;s install/manage flow, then
                return here and refresh the page.
              </p>
              <a
                className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                href={env.GITHUB_APP_INSTALL_URL}
                rel="noreferrer"
                target="_blank"
              >
                Grant Access
              </a>
            </div>
          ) : null}

          {issuesResult.status === "error" ? (
            <div className="mt-6 rounded-[2rem] border border-rose-200 bg-rose-50 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-700">
                GitHub fetch failed
              </p>
              <h4 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
                Issues could not be loaded right now
              </h4>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-700">
                The project metadata is still available, but GitHub did not
                return the live issue list. Try refreshing the page in a moment.
              </p>
            </div>
          ) : null}

          {issuesResult.status === "ok" && issuesResult.issues.length === 0 ? (
            <div className="mt-6 rounded-[2rem] border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">
                No open issues
              </p>
              <h4 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
                This repository has no open issues right now
              </h4>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                GitHub returned a clean issue list for this repo, but there are
                no open issues to show yet.
              </p>
            </div>
          ) : null}

          {issuesResult.status === "ok" && issuesResult.issues.length > 0 ? (
            <div className="mt-6 space-y-4">
              {issuesResult.issues.map((issue) => (
                <a
                  className="flex flex-col gap-4 rounded-3xl border border-slate-200 p-5 transition hover:border-slate-300 hover:bg-slate-50 md:flex-row md:items-start md:justify-between"
                  href={issue.url}
                  key={issue.id}
                  rel="noreferrer"
                  target="_blank"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                        Open
                      </span>
                      <span className="text-sm font-medium text-slate-500">
                        #{issue.number}
                      </span>
                    </div>
                    <h4 className="text-lg font-semibold tracking-tight text-slate-950">
                      {issue.title}
                    </h4>
                    <p className="text-sm leading-6 text-slate-600">
                      Opened by {issue.author} • {issue.comments} comments
                    </p>
                    <p className="text-sm leading-6 text-slate-500">
                      Updated {new Date(issue.updatedAt).toLocaleString()}
                    </p>
                  </div>

                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                    Open on GitHub
                  </span>
                </a>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
