import { Github, ShieldCheck, ShieldAlert, ExternalLink, Database } from "lucide-react";

import { AppShell } from "~/components/app-shell";
import { getAuth } from "~/server/auth/session";
import { db } from "~/server/db";
import { env } from "~/env";
import { requireGithubConnection } from "~/server/github/guard";
import { readGithubImportSession } from "~/server/github/import-session";
import {
  fetchGithubViewerLogin,
  fetchImportRepositories,
} from "~/server/github/repos";
import { Button } from "~/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { RepositoryOwnerFilter } from "~/components/repository-owner-filter";
import { RepositorySearchBar } from "~/components/repository-search-bar";
import { ImportGuidePopup } from "~/components/import-guide-popup";
import { ImportLoadButton } from "~/components/import-load-button";

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
    owner?: string;
    success?: string;
  }>;
};

export default async function NewProjectPage({
  searchParams,
}: NewProjectPageProps) {
  const { userId } = await getAuth();
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

  const importedProjectsRecord = Object.fromEntries(
    importedProjects.map((project) => [
      `${project.repoOwner.toLowerCase()}/${project.repoName.toLowerCase()}`,
      project.id,
    ]),
  );

  let repoList:
    | Awaited<ReturnType<typeof fetchImportRepositories>>
    | null = null;
  let viewerLogin: string | null = null;
  let sessionError: string | null = null;

  if (importSession) {
    try {
      [repoList, viewerLogin] = await Promise.all([
        fetchImportRepositories(importSession.accessToken),
        fetchGithubViewerLogin(importSession.accessToken),
      ]);
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
  const ownerOptions = repoList
    ? Array.from(new Set(repoList.map((repo) => repo.owner))).sort((a, b) => {
        if (viewerLogin && a.toLowerCase() === viewerLogin.toLowerCase()) {
          return -1;
        }

        if (viewerLogin && b.toLowerCase() === viewerLogin.toLowerCase()) {
          return 1;
        }

        return a.localeCompare(b);
      })
    : [];
  const requestedOwner = params.owner;
  const selectedOwner =
    ownerOptions.find(
      (owner) => requestedOwner?.toLowerCase() === owner.toLowerCase(),
    ) ??
    ownerOptions.find(
      (owner) => viewerLogin?.toLowerCase() === owner.toLowerCase(),
    ) ??
    ownerOptions[0] ??
    "";
  const filteredRepos =
    repoList?.filter((repo) => repo.owner === selectedOwner) ?? [];

  return (
    <AppShell title="Import Repository">
      <div className="space-y-8">
        {errorMessage && (
          <Alert variant="destructive" className="rounded-none border-destructive/20 bg-destructive/10">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            <AlertTitle className="text-[10px] font-bold uppercase tracking-widest">Session Error</AlertTitle>
            <AlertDescription className="text-xs font-medium uppercase mt-1">
              {errorMessage}
            </AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert className="rounded-none border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <AlertTitle className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Status Update</AlertTitle>
            <AlertDescription className="text-xs font-medium uppercase mt-1">
              {successMessage}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <ImportLoadButton
            hasSession={!!importSession}
            href="/api/github/import-session/start"
          />
          <Button asChild variant="outline" className="border-border font-bold uppercase text-[10px] tracking-widest h-12 rounded-none px-8">
            <a href={env.GITHUB_APP_INSTALL_URL} rel="noreferrer" target="_blank">
              Grant Access
              <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </a>
          </Button>
          <ImportGuidePopup />
        </div>

        {!repoList ? (
          <div className="flex flex-col items-center justify-center border border-dashed border-border bg-muted/10 py-24 text-center">
            <Database className="h-8 w-8 text-muted-foreground/30 mb-4" />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {importSession ? "Repositories Unavailable" : "Repositories Not Loaded"}
            </p>
            <p className="mt-2 text-[10px] text-muted-foreground uppercase max-w-[240px] leading-relaxed">
              {importSession
                ? "The current session could not return repository data. Refresh access and try again."
                : "Load your GitHub repositories to choose one to import."}
            </p>
          </div>
        ) : (
          <section className="space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Repositories<span className="mx-1 text-muted-foreground/30">/</span><Github className="h-3 w-3" /><span className="text-foreground">{selectedOwner}</span>
              </p>
              {ownerOptions.length > 0 && (
                <RepositoryOwnerFilter
                  owners={ownerOptions}
                  selectedOwner={selectedOwner}
                />
              )}
            </div>

            <RepositorySearchBar
              disabled={filteredRepos.length === 0}
              githubAppInstallUrl={env.GITHUB_APP_INSTALL_URL}
              importedProjects={importedProjectsRecord}
              repositories={filteredRepos}
            />
          </section>
        )}
      </div>
    </AppShell>
  );
}
