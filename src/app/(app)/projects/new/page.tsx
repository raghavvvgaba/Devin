import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Github, RefreshCw, ShieldCheck, ShieldAlert, Plus, ExternalLink, Database } from "lucide-react";

import { AppShell } from "~/components/app-shell";
import { db } from "~/server/db";
import { env } from "~/env";
import { requireGithubConnection } from "~/server/github/guard";
import { readGithubImportSession } from "~/server/github/import-session";
import { fetchImportRepositories } from "~/server/github/repos";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";

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
  const nextStepMessage = !importSession
    ? "Start a fresh GitHub import session before selecting a repository."
    : repoList && repoList.length === 0
      ? "GitHub access is active, but no importable repositories were returned."
      : "Import a repository marked Ready, or grant access to a locked one.";

  return (
    <AppShell
      description="Initialize secure repository indexing. Select target resources from the authenticated GitHub session."
      title="Import Resource"
    >
      <div className="space-y-8">
        <Alert className="rounded-none border-primary/20 bg-primary/5">
          <Github className="h-4 w-4 text-primary" />
          <AlertTitle className="text-[10px] font-bold uppercase tracking-widest">
            Next Step
          </AlertTitle>
          <AlertDescription className="text-xs font-medium uppercase mt-1">
            {nextStepMessage}
          </AlertDescription>
        </Alert>

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

        <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <Card className="rounded-none border-border shadow-none bg-primary text-primary-foreground">
            <CardHeader className="border-b border-primary-foreground/10 pb-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-foreground/60">
                  Import Procedure
                </p>
                <CardTitle className="text-xl uppercase tracking-tight">Resource Selection</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-6">
                <p className="text-sm leading-relaxed text-primary-foreground/80">
                  Indexed repositories become manageable projects within the Devin 
                  environment. Synchronization requires an active short-lived session token. 
                  Resources marked [READY] are available for immediate indexing.
                </p>
                <div className="flex flex-wrap gap-4 pt-4 border-t border-primary-foreground/10">
                  <Button asChild className="bg-primary-foreground text-primary font-bold uppercase text-[10px] tracking-widest h-12 rounded-none px-8 hover:bg-primary-foreground/90">
                    <Link href="/api/github/import-session/start">
                      <RefreshCw className="mr-2 h-3.5 w-3.5" />
                      {importSession ? "Refresh Registry" : "Initialize Registry"}
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="border-primary-foreground/20 text-primary-foreground font-bold uppercase text-[10px] tracking-widest h-12 rounded-none px-8 hover:bg-primary-foreground/10 hover:text-primary-foreground">
                    <a href={env.GITHUB_APP_INSTALL_URL} rel="noreferrer" target="_blank">
                      Grant Access
                      <ExternalLink className="ml-2 h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card">
            <CardHeader className="border-b border-border pb-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Constraints
                </p>
                <CardTitle className="text-xl uppercase tracking-tight">Expectations</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <ul className="space-y-4">
                {[
                  "Session tokens expire after 60 minutes of inactivity.",
                  "Only resources with explicit App authorization are visible.",
                  "Organizational assets require Organization-level installation."
                ].map((item, i) => (
                  <li key={i} className="flex gap-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <span className="text-primary font-mono">[0{i+1}]</span>
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        {!repoList ? (
          <div className="flex flex-col items-center justify-center border border-dashed border-border bg-muted/10 py-24 text-center">
            <Database className="h-8 w-8 text-muted-foreground/30 mb-4" />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {importSession ? "Registry Unavailable" : "Registry Offline"}
            </p>
            <p className="mt-2 text-[10px] text-muted-foreground uppercase max-w-[240px] leading-relaxed">
              {importSession
                ? "The current session could not return repository data. Refresh access and try again."
                : "Initialize a fresh GitHub session to scan for importable repository resources."}
            </p>
          </div>
        ) : (
          <section className="space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Registry Result
                </p>
                <h2 className="text-xl font-bold uppercase tracking-tight">Discovered Resources</h2>
              </div>
              <Badge className="bg-muted text-muted-foreground border-border rounded-none text-[10px] font-bold uppercase tracking-widest px-3 py-1">
                {repoList.length} Units Found
              </Badge>
            </div>

            <div className="grid gap-px bg-border border border-border">
              {repoList.length === 0 && (
                <div className="bg-card py-12 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    No Importable Repositories Returned
                  </p>
                  <p className="mt-2 text-[10px] text-muted-foreground uppercase">
                    Refresh access or grant the GitHub App access to a repository and try again.
                  </p>
                </div>
              )}

              {repoList.map((repo) => {
                const importedProject = importedProjectMap.get(
                  repo.fullName.toLowerCase(),
                );
                
                return (
                  <div
                    className="flex flex-col gap-6 bg-card p-6 md:flex-row md:items-center md:justify-between group transition hover:bg-muted/50"
                    key={repo.id}
                  >
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center bg-muted border border-border group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          <Github className="h-4 w-4" />
                        </div>
                        <h3 className="text-sm font-bold tracking-tight uppercase">
                          {repo.fullName}
                        </h3>
                        <Badge className={`rounded-none text-[10px] font-bold uppercase tracking-widest ${
                          importedProject
                            ? "bg-primary/10 text-primary border-primary/20"
                            : repo.status === "ready"
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                        }`}>
                          {importedProject ? "INDEXED" : repo.status === "ready" ? "READY" : "LOCKED"}
                        </Badge>
                        {repo.private && (
                          <Badge variant="outline" className="border-border text-[10px] font-bold uppercase tracking-widest rounded-none text-muted-foreground">
                            PRIVATE
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-relaxed">
                        {importedProject
                          ? "Identity already exists within local project registry."
                          : repo.status === "ready"
                            ? "Authorization verified. Unit is eligible for local indexing."
                            : "Authorization missing. Repository visibility confirmed, but access is restricted."}
                      </p>
                    </div>

                    <div className="flex shrink-0">
                      {importedProject ? (
                        <Button asChild variant="outline" className="border-border font-bold uppercase text-[10px] tracking-widest h-10 rounded-none px-6">
                          <Link href={`/projects/${importedProject.id}`}>
                            Open Project
                          </Link>
                        </Button>
                      ) : repo.status === "ready" ? (
                        <form action="/projects" method="post">
                          <input name="repoOwner" type="hidden" value={repo.owner} />
                          <input name="repoName" type="hidden" value={repo.name} />
                          <Button className="bg-primary text-primary-foreground font-bold uppercase text-[10px] tracking-widest h-10 rounded-none px-8" type="submit">
                            <Plus className="mr-2 h-3.5 w-3.5" />
                            Initialize Index
                          </Button>
                        </form>
                      ) : (
                        <Button asChild variant="outline" className="border-amber-500/20 text-amber-500 hover:bg-amber-500/10 font-bold uppercase text-[10px] tracking-widest h-10 rounded-none px-6">
                          <a href={env.GITHUB_APP_INSTALL_URL} rel="noreferrer" target="_blank">
                            Unlock Access
                          </a>
                        </Button>
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
