import Link from "next/link";
import {
  ArrowUpRight,
  FolderGit2,
  Github,
  Plus,
} from "lucide-react";

import { AppShell } from "~/components/app-shell";
import { GithubConnectionToast } from "~/components/github-connection-toast";
import { GithubDisconnectDialog } from "~/components/github-disconnect-dialog";
import { GithubDisconnectToast } from "~/components/github-disconnect-toast";
import { NewImportModal } from "~/components/new-import-modal";
import { Button } from "~/components/ui/button";
import { env } from "~/env";
import { getAuth } from "~/server/auth/session";
import { getProjectsPageData } from "~/server/projects";

type ProjectsPageProps = {
  searchParams: Promise<{
    error?: string;
    newImport?: string;
    owner?: string;
    success?: string;
  }>;
};

function formatImportedDate(value: Date) {
  return value.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const { userId } = await getAuth();
  const params = await searchParams;
  const { githubStatus, projects } = await getProjectsPageData(userId!);

  const defaultOpen =
    !!params.newImport ||
    params.success === "import_session_ready" ||
    !!params.error;
  const projectCount = projects.length;

  return (
    <AppShell compactHeader description="" title="Projects">
      <GithubConnectionToast
        didConnect={params.success === "github_connected"}
      />
      <GithubDisconnectToast
        didDisconnect={params.success === "disconnected"}
      />

      <div className="space-y-8 pb-8">
        <section className="flex flex-col gap-6 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="inlaya-display text-5xl font-medium tracking-[-0.055em] sm:text-6xl">
              Projects
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {projectCount} {projectCount === 1 ? "repository" : "repositories"}
            </p>
          </div>

          {githubStatus.connected ? (
            <NewImportModal
              defaultOpen={defaultOpen}
              githubAppInstallUrl={env.GITHUB_APP_INSTALL_URL}
              owner={params.owner}
              trigger={
                <Button className="h-11 rounded-none px-5 text-sm font-semibold">
                  <Plus className="h-4 w-4" />
                  Import repository
                </Button>
              }
            />
          ) : (
            <Button
              asChild
              className="h-11 rounded-none px-5 text-sm font-semibold"
            >
              <Link href="/onboarding/github">
                <Github className="h-4 w-4" />
                Connect GitHub
              </Link>
            </Button>
          )}
        </section>

        <section className="flex flex-col gap-4 border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[#171713] text-[#fffaf0] dark:bg-[#fffaf0] dark:text-[#171713]">
              <Github className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {githubStatus.connected && githubStatus.githubUsername
                  ? `@${githubStatus.githubUsername}`
                  : "GitHub not connected"}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    githubStatus.connected ? "bg-emerald-500" : "bg-[#f04f2f]"
                  }`}
                />
                {githubStatus.connected ? "Connected" : "Disconnected"}
              </p>
            </div>
          </div>

          {githubStatus.connected && githubStatus.githubUsername ? (
            <GithubDisconnectDialog
              githubUsername={githubStatus.githubUsername}
              projectCount={projectCount}
            />
          ) : null}
        </section>

        {projects.length === 0 ? (
          <section className="flex min-h-[340px] flex-col items-center justify-center border border-dashed border-border bg-card/60 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-muted text-muted-foreground">
              <FolderGit2 className="h-5 w-5" />
            </div>
            <h2 className="inlaya-display mt-5 text-2xl font-medium tracking-[-0.035em]">
              No repositories yet
            </h2>
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {projects.map((project) => (
              <article
                className="group border border-border bg-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[7px_7px_0_rgba(240,79,47,0.13)]"
                key={project.id}
              >
                <Link
                  className="flex min-h-[180px] flex-col p-6"
                  href={`/projects/${project.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-10 w-10 items-center justify-center bg-[#171713] text-[#fffaf0] transition-colors group-hover:bg-[#f04f2f] dark:bg-[#fffaf0] dark:text-[#171713]">
                      <Github className="h-4 w-4" />
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </div>

                  <div className="mt-auto pt-8">
                    <p className="text-xs text-muted-foreground">
                      {project.repoOwner}
                    </p>
                    <h2 className="inlaya-display mt-1 truncate text-2xl font-medium tracking-[-0.035em]">
                      {project.repoName}
                    </h2>
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      Imported {formatImportedDate(project.createdAt)}
                    </p>
                  </div>
                </Link>
              </article>
            ))}
          </section>
        )}
      </div>
    </AppShell>
  );
}
