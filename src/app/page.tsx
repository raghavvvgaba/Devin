import { SignedIn, SignedOut } from "@clerk/nextjs";
import Link from "next/link";
import { Terminal, ArrowRight, Github, LayoutDashboard } from "lucide-react";

const workflow = [
  "Sign in with Clerk",
  "Connect GitHub",
  "Import an existing repository",
  "Open a project and review issues",
  "Generate an AI edit for one file",
  "Commit, push, and open a pull request",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background selection:bg-primary selection:text-primary-foreground">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6">
        <header className="flex h-16 items-center justify-between border-b border-border">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center bg-primary text-primary-foreground">
              <Terminal className="h-5 w-5" />
            </div>
            <span className="text-sm font-bold tracking-tighter uppercase">
              Devin
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <SignedOut>
              <Link
                className="text-xs font-bold uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
                href="/sign-in"
              >
                Sign in
              </Link>
              <Link
                className="bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground transition hover:bg-primary/90"
                href="/sign-up"
              >
                Get Started
              </Link>
            </SignedOut>
            <SignedIn>
              <Link
                className="flex items-center gap-2 bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground transition hover:bg-primary/90"
                href="/dashboard"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
            </SignedIn>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1fr_0.8fr]">
          <div className="space-y-12">
            <div className="inline-flex items-center gap-2 border border-border bg-muted/50 px-3 py-1">
              <div className="h-2 w-2 animate-pulse bg-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
                System Status: Operational
              </span>
            </div>
            
            <div className="space-y-6">
              <h1 className="text-4xl font-bold tracking-tighter uppercase sm:text-6xl lg:text-7xl">
                The Contribution <br />
                <span className="text-muted-foreground">Layer for</span> <br />
                Everyone.
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                Devin is a minimalist interface for GitHub workflows. We remove the 
                complexity of developer tooling, providing a clean technical readout 
                for non-technical contributors to bridge the gap between ideas and code.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <Link
                className="group flex items-center gap-2 bg-primary px-6 py-4 text-xs font-bold uppercase tracking-widest text-primary-foreground transition hover:bg-primary/90"
                href="/dashboard"
              >
                Initialize App
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                className="flex items-center gap-2 border border-border bg-background px-6 py-4 text-xs font-bold uppercase tracking-widest transition hover:bg-muted"
                href="/sign-up"
              >
                <Github className="h-4 w-4" />
                Auth via Clerk
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-8 border-t border-border pt-8">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Architecture
                </p>
                <p className="mt-2 text-xs font-bold">NEXT.JS 15 + PRISMA</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Security
                </p>
                <p className="mt-2 text-xs font-bold">CLERK PROTECTED</p>
              </div>
            </div>
          </div>

          <div className="border border-border bg-card p-1 shadow-2xl">
            <div className="border border-border bg-background p-6">
              <div className="flex items-center justify-between border-b border-border pb-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Workflow
                  </p>
                  <h2 className="text-xl font-bold uppercase tracking-tight">Tiny Contribution Loop</h2>
                </div>
                <div className="border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-500">
                  Active
                </div>
              </div>
              <div className="mt-8 space-y-2">
                {workflow.map((step, index) => (
                  <div
                    className="group flex items-center gap-4 border border-transparent p-3 transition hover:border-border hover:bg-muted/50"
                    key={step}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-muted text-[10px] font-bold transition group-hover:bg-primary group-hover:text-primary-foreground">
                      0{index + 1}
                    </span>
                    <p className="text-xs font-medium leading-none tracking-tight text-muted-foreground group-hover:text-foreground">
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-auto border-t border-border py-8">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              © 2026 Devin Engineering
            </p>
            <div className="flex gap-6">
              <a href="#" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">Docs</a>
              <a href="#" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">API</a>
              <a href="#" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">System Log</a>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
