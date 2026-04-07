import type { ReactNode } from "react";

type AuthShellProps = {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
};

export function AuthShell({
  children,
  eyebrow,
  title,
  description,
}: AuthShellProps) {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fffaf0_0%,#ffffff_45%,#eff6ff_100%)] px-6 py-10 text-slate-950">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="flex flex-col justify-between rounded-[2rem] bg-slate-950 p-8 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-300">
              {eyebrow}
            </p>
            <h1 className="max-w-sm text-4xl font-semibold tracking-tight text-balance">
              {title}
            </h1>
            <p className="max-w-md text-sm leading-7 text-slate-300">
              {description}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-300">
              Phase 1 includes authentication, protected routes, and the app
              data model. GitHub connection and repository actions arrive in the
              next phases.
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center rounded-[2rem] border border-slate-200 bg-white/85 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
          {children}
        </section>
      </div>
    </main>
  );
}
