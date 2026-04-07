import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { AppShell } from "~/components/app-shell";
import { db } from "~/server/db";
import { env } from "~/env";
import { requireGithubConnection } from "~/server/github/guard";
import { readGithubImportSession } from "~/server/github/import-session";
import { fetchImportRepositories } from "~/server/github/repos";

const errorMessages: Record<string, string> = {
  github_required: "Connect GitHub before importing a repository.",
  github_repo_fetch_failed:
    "GitHub did not return the repository list. Refresh access and try again.",
  missing_repo_selection: "Choose a repository before importing.",
  refresh_import_session:
    "Your GitHub import session expired. Refresh repository access and try again.",
  repo_needs_access:
    "That repository is visible, but the GitHub App does not have access yet.",
  repo_not_in_session:
    "That repository is not in the current GitHub import session. Refresh and try again.",
};

const successMessages: Record<string, string> = {
  import_session_ready:
    "Repository access refreshed. You can import any repo marked Ready.",
};

type NewProjectPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default async function NewProjectPage({
  searchParams,
}: NewProjectPageProps) {
  const { userId } = await auth();
  await requireGithubConnection(userId!);

  const params = await searchParams;
  const importSession = await readGithubImportSession();
  const importedProjects = await db.project.findMany({
    where: { userId: userId! },
    select: {
      id: true,
      repoName: true,
      repoOwner: true,
    },
  });

  const importedProjectMap = new Map(
    importedProjects.map((project) => [
      `${project.repoOwner.toLowerCase()}/${project.repoName.toLowerCase()}`,
      project,
    ]),
  );

  let repoList:
    | Awaited<ReturnType<typeof fetchImportRepositories>>
    | null = null;
  let sessionError: string | null = null;

  if (importSession) {
    try {
      repoList = await fetchImportRepositories(importSession.accessToken);
    } catch {
      sessionError =
        errorMessages.github_repo_fetch_failed ??
        "GitHub did not return the repository list. Refresh access and try again.";
    }
  }

  const errorMessage =
    sessionError ??
    (params.error ? (errorMessages[params.error] ?? null) : null) ??
    null;
  const successMessage = params.success
    ? (successMessages[params.success] ?? null)
    : null;

  return (
    <AppShell
      description="Refresh GitHub repository access for this session, then import an existing repository into the app as a project."
      title="Import Repository"
    >
      <div className="space-y-6">
        {errorMessage ? (
          <div className="rounded-[2rem] border border-rose-200 bg-rose-50 p-5 text-sm leading-7 text-rose-800 shadow-sm">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 text-sm leading-7 text-emerald-800 shadow-sm">
            {successMessage}
          </div>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">
              Phase 3
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              Import an existing repository
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              The app fetches a short-lived repo list from GitHub for each
              import session. Repositories marked Ready can be imported now.
              If the repo is missing or needs additional grants, GitHub still
              controls that access step.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                href="/api/github/import-session/start"
              >
                {importSession ? "Refresh GitHub Access" : "Load Repositories"}
              </Link>
              <a
                className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/50"
                href={env.GITHUB_APP_INSTALL_URL}
                rel="noreferrer"
                target="_blank"
              >
                Grant Repo Access
              </a>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">
              What to expect
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
              <li>GitHub access refresh is temporary and expires quickly.</li>
              <li>Ready repos can be imported immediately.</li>
              <li>
                If a repo is missing or blocked, use GitHub&apos;s install/manage
                flow to grant the app access and refresh again.
              </li>
            </ul>
          </div>
        </section>

        {!repoList ? (
          <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white/80 p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Import session needed
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              Refresh repositories from GitHub
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              Start a fresh GitHub repo session to see which repositories are
              ready to import.
            </p>
          </section>
        ) : (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">
                  GitHub repositories
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  Visible repositories in this import session
                </h2>
              </div>
              <p className="text-sm text-slate-500">{repoList.length} repositories</p>
            </div>

            <div className="mt-6 space-y-4">
              {repoList.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-5 text-sm leading-7 text-slate-600">
                  No repositories were returned by GitHub for this session.
                </div>
              ) : null}

              {repoList.map((repo) => {
                const importedProject = importedProjectMap.get(
                  repo.fullName.toLowerCase(),
                );
                const statusLabel = importedProject
                  ? "Imported"
                  : repo.status === "ready"
                    ? "Ready"
                    : "Needs access";

                return (
                  <div
                    className="flex flex-col gap-4 rounded-3xl border border-slate-200 p-5 md:flex-row md:items-center md:justify-between"
                    key={repo.id}
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-semibold tracking-tight">
                          {repo.fullName}
                        </h3>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                            importedProject
                              ? "bg-cyan-100 text-cyan-800"
                              : repo.status === "ready"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {statusLabel}
                        </span>
                        {repo.private ? (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                            Private
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm leading-6 text-slate-600">
                        {importedProject
                          ? "This repository is already imported into the app."
                          : repo.status === "ready"
                            ? "The GitHub App can access this repository right now."
                            : "The repository is visible, but the GitHub App still needs to be granted access."}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {importedProject ? (
                        <Link
                          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:border-slate-950"
                          href={`/projects/${importedProject.id}`}
                        >
                          Open project
                        </Link>
                      ) : repo.status === "ready" ? (
                        <form action="/projects" method="post">
                          <input name="repoOwner" type="hidden" value={repo.owner} />
                          <input name="repoName" type="hidden" value={repo.name} />
                          <button
                            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                            type="submit"
                          >
                            Import
                          </button>
                        </form>
                      ) : (
                        <a
                          className="rounded-full border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:border-amber-500"
                          href={env.GITHUB_APP_INSTALL_URL}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Grant access
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
