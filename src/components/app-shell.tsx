import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";

type AppShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/projects/new", label: "Import repo" },
  { href: "/onboarding/github", label: "GitHub onboarding" },
];

export function AppShell({ title, description, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_35%,#ecfeff_100%)] text-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col px-6 py-8">
        <header className="flex flex-col gap-6 rounded-[2rem] border border-slate-200 bg-white/85 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.06)] backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <Link className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700" href="/dashboard">
              Devin
            </Link>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <nav className="flex flex-wrap gap-2">
              {navItems.map((item) => (
                <Link
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium transition hover:border-slate-950"
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <UserButton />
          </div>
        </header>

        <section className="py-8">{children}</section>
      </div>
    </div>
  );
}
