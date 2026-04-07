import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { AppShell } from "~/components/app-shell";
import { db } from "~/server/db";
import { getGithubConnectionStatus } from "~/server/github/connection";

export default async function DashboardPage() {
  const { userId } = await auth();

  const [projects, githubStatus] = await Promise.all([
    db.project.findMany({
      where: { userId: userId! },
      orderBy: { createdAt: "desc" },
    }),
    getGithubConnectionStatus(userId!),
  ]);

  const projectCount = projects.length;

  return (
    <AppShell
      description="Your protected workspace is live. GitHub connection is now part of the product flow, and repository import is the next milestone."
      title="Dashboard"
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">
            Status
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            {githubStatus.connected
              ? "GitHub is connected"
              : "GitHub connection still needs setup"}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            {githubStatus.connected
              ? `Your account is connected as ${githubStatus.githubUsername}. You can move on to repository import next.`
              : "Clerk and Prisma are ready, but you still need to connect GitHub before the repository import flow can begin."}
          </p>
          {!githubStatus.connected ? (
            <Link
              className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              href="/onboarding/github"
            >
              Connect GitHub
            </Link>
          ) : null}
        </section>

        <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">
            Snapshot
          </p>
          <div className="mt-6 space-y-3">
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-sm text-slate-300">Imported projects</p>
              <p className="mt-2 text-3xl font-semibold">{projectCount}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-sm text-slate-300">GitHub status</p>
              <p className="mt-2 text-lg font-medium">
                {githubStatus.connected
                  ? `Connected as ${githubStatus.githubUsername}`
                  : "Awaiting connection"}
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Projects
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Imported repositories
            </h2>
          </div>
          <Link
            className="inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            href="/projects/new"
          >
            New import
          </Link>
        </div>

        <div className="mt-6 space-y-4">
          {projects.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-5 text-sm leading-7 text-slate-600">
              No repositories have been imported yet. Connect GitHub, refresh
              repository access, and bring your first project into the app.
            </div>
          ) : null}

          {projects.map((project) => (
            <div
              className="flex flex-col gap-3 rounded-3xl border border-slate-200 p-5 md:flex-row md:items-center md:justify-between"
              key={project.id}
            >
              <div>
                <h3 className="text-lg font-semibold tracking-tight">
                  {project.repoOwner}/{project.repoName}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Imported on {project.createdAt.toLocaleDateString()}
                </p>
              </div>
              <Link
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:border-slate-950"
                href={`/projects/${project.id}`}
              >
                Open project
              </Link>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
