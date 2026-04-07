import { SignedIn, SignedOut } from "@clerk/nextjs";
import Link from "next/link";

export const dynamic = "force-dynamic";

const workflow = [
  "Sign in with Clerk",
  "Connect GitHub",
  "Import an existing repository",
  "Open a project and review issues",
  'Append "hello world" to a file',
  "Commit, push, and open a pull request",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fef3c7,transparent_30%),linear-gradient(180deg,#fff7ed_0%,#ffffff_48%,#ecfeff_100%)] text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <header className="flex items-center justify-between">
          <Link className="text-lg font-semibold tracking-tight" href="/">
            Devin
          </Link>
          <div className="flex items-center gap-3 text-sm font-medium">
            <SignedOut>
              <Link
                className="rounded-full border border-slate-300 px-4 py-2 transition hover:border-slate-950"
                href="/sign-in"
              >
                Sign in
              </Link>
              <Link
                className="rounded-full bg-slate-950 px-4 py-2 text-white transition hover:bg-slate-800"
                href="/sign-up"
              >
                Create account
              </Link>
            </SignedOut>
            <SignedIn>
              <Link
                className="rounded-full bg-slate-950 px-4 py-2 text-white transition hover:bg-slate-800"
                href="/dashboard"
                prefetch={false}
              >
                Open dashboard
              </Link>
            </SignedIn>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-8">
            <div className="inline-flex rounded-full border border-amber-300 bg-white/80 px-4 py-1 text-sm font-medium text-amber-900 shadow-sm backdrop-blur">
              Phase 1 foundation
            </div>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
                GitHub contribution workflows without developer tooling overhead.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-600">
                Devin gives non-technical teammates a calmer path into existing
                repositories. This foundation ships auth, data models, and a
                protected app shell so the MVP flow can grow phase by phase.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                href="/dashboard"
                prefetch={false}
              >
                View protected app
              </Link>
              <Link
                className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold transition hover:border-slate-950"
                href="/sign-up"
              >
                Start with Clerk
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  MVP workflow
                </p>
                <h2 className="text-2xl font-semibold">Tiny contribution loop</h2>
              </div>
              <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                Active
              </div>
            </div>
            <ol className="mt-6 space-y-4">
              {workflow.map((step, index) => (
                <li
                  className="flex items-start gap-4 rounded-2xl bg-slate-50 px-4 py-3"
                  key={step}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-slate-700">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </main>
  );
}
