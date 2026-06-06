import Link from "next/link";
import {
  ArrowUpRight,
  Github,
  Layers,
  Plus,
} from "lucide-react";

import { AppShell } from "~/components/app-shell";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { getAuth } from "~/server/auth/session";
import { getDashboardPageData } from "~/server/projects";

export default async function DashboardPage() {
  const { userId } = await getAuth();
  const { githubStatus, projects } = await getDashboardPageData(userId!);

  const projectCount = projects.length;

  return (
    <AppShell
      description=""
      title="Dashboard"
    >
      <div className="flex justify-end pb-8">
        <div className="flex flex-wrap items-center gap-2">
          {githubStatus.connected ? (
            <Badge className="rounded-none px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest border-border bg-card text-foreground hover:bg-card">
              @{githubStatus.githubUsername}
            </Badge>
          ) : null}
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            GitHub
          </span>
          <Badge
            className={`rounded-none px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
              githubStatus.connected
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10"
                : "border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/10"
            }`}
          >
            {githubStatus.connected ? "Connected" : "Not Connected"}
          </Badge>
          <Badge
            className={`rounded-none px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
              githubStatus.connected
                ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/10"
                : "border-amber-500/20 bg-amber-500/10 text-amber-500 hover:bg-amber-500/10"
            }`}
          >
            {githubStatus.connected ? "Sync Active" : "Sync Awaiting"}
          </Badge>
        </div>
      </div>

      <section className="space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Inventory
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold uppercase tracking-tight">
                Managed Repositories
              </h2>
              <Badge className="rounded-none border-border bg-card px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-foreground hover:bg-card">
                {projectCount} {projectCount === 1 ? "Project" : "Projects"}
              </Badge>
            </div>
          </div>
          <Button
            asChild
            variant="outline"
            className="h-10 rounded-none border-border px-4 text-[10px] font-bold uppercase tracking-widest"
          >
            <Link href="/projects/new">
              <Plus className="mr-2 h-3.5 w-3.5" />
              New Import
            </Link>
          </Button>
        </div>

        <div className="grid gap-4">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center border border-dashed border-border bg-muted/10 py-12 text-center">
              <Layers className="mb-4 h-8 w-8 text-muted-foreground/30" />
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {githubStatus.connected
                  ? "No Repositories Indexed Yet"
                  : "No Repositories Indexed"}
              </p>
              <p className="mt-2 max-w-[200px] text-[10px] uppercase text-muted-foreground">
                {githubStatus.connected
                  ? "Your GitHub identity is ready. Initialize your first project import."
                  : "Connect GitHub and initialize your first project import."}
              </p>
              <div className="mt-6">
                <Button
                  asChild
                  variant={githubStatus.connected ? "default" : "outline"}
                  className="h-10 rounded-none px-6 text-[10px] font-bold uppercase tracking-widest"
                >
                  <Link
                    href={
                      githubStatus.connected
                        ? "/projects/new"
                        : "/onboarding/github"
                    }
                  >
                    {githubStatus.connected ? "Start Import" : "Connect GitHub"}
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            projects.map((project) => (
              <div
                className="group flex items-center justify-between border border-border bg-card p-4 transition hover:bg-muted/50"
                key={project.id}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center bg-muted text-muted-foreground transition group-hover:bg-primary group-hover:text-primary-foreground">
                    <Github className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-tight">
                      {project.repoOwner}/{project.repoName}
                    </h3>
                    <p className="mt-0.5 text-[10px] uppercase text-muted-foreground">
                      Indexed on {project.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Button
                  asChild
                  variant="ghost"
                  className="h-10 w-10 rounded-none border border-transparent p-0 hover:border-border hover:bg-background"
                >
                  <Link href={`/projects/${project.id}`}>
                    <ArrowUpRight className="h-4 w-4" />
                    <span className="sr-only">Open Project</span>
                  </Link>
                </Button>
              </div>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
