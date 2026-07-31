import { SignedIn, SignedOut } from "@clerk/nextjs";
import {
  ArrowRight,
  Check,
  Code2,
  GitBranch,
  Github,
  Layers3,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import Link from "next/link";

import { InlayaMark } from "~/components/inlaya-mark";
import { LandingNavigation } from "~/components/landing-navigation";

const workflow = [
  {
    number: "01",
    title: "Bring the issue",
    description:
      "Connect a GitHub repository and choose the issue that needs attention. Inlaya carries the context into the workspace.",
    icon: Github,
  },
  {
    number: "02",
    title: "Shape the change",
    description:
      "Work with an AI agent inside an isolated sandbox. Plan, edit, and iterate without touching your production branch.",
    icon: Code2,
  },
  {
    number: "03",
    title: "Fit it into place",
    description:
      "Review the live preview and diff, then turn the finished work into a clean pull request for your team.",
    icon: GitBranch,
  },
];

function PrimaryAction() {
  return (
    <>
      <SignedOut>
        <Link
          href="/sign-up"
          className="group inline-flex h-12 items-center justify-center gap-3 bg-[#171713] px-6 text-sm font-semibold text-[#fffaf0] transition hover:bg-[#f04f2f] dark:bg-[#fffaf0] dark:text-[#171713] dark:hover:bg-[#f04f2f]"
        >
          Start building
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </SignedOut>
      <SignedIn>
        <Link
          href="/projects"
          className="group inline-flex h-12 items-center justify-center gap-3 bg-[#171713] px-6 text-sm font-semibold text-[#fffaf0] transition hover:bg-[#f04f2f] dark:bg-[#fffaf0] dark:text-[#171713] dark:hover:bg-[#f04f2f]"
        >
          Open your projects
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </SignedIn>
    </>
  );
}

export default function HomePage() {
  return (
    <div className="inlaya-landing min-h-dvh overflow-x-hidden bg-[#f3efe5] text-[#171713] selection:bg-[#f04f2f] selection:text-white dark:bg-[#11110f] dark:text-[#f3efe5]">
      <LandingNavigation />

      <main>
        <section className="relative border-b border-[#171713]/15 px-5 pb-20 pt-32 dark:border-[#fffaf0]/15 sm:px-8 sm:pb-28 sm:pt-40 lg:px-12 lg:pb-32">
          <div className="pointer-events-none absolute -right-24 top-8 h-80 w-80 rotate-45 border border-[#171713]/10 dark:border-[#fffaf0]/10 sm:h-[34rem] sm:w-[34rem]" />
          <div className="pointer-events-none absolute right-16 top-44 h-32 w-32 rotate-45 bg-[#f04f2f]/10 sm:right-48 sm:h-48 sm:w-48" />

          <div className="relative mx-auto grid max-w-[1344px] items-center gap-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-20">
            <div className="inlaya-rise">
              <div className="mb-7 inline-flex items-center gap-2 border border-[#171713]/20 bg-[#fffaf0]/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] dark:border-[#fffaf0]/20 dark:bg-white/5">
                <Sparkles className="h-3.5 w-3.5 text-[#f04f2f]" />
                Your issue-to-PR workspace
              </div>

              <h1 className="inlaya-display max-w-3xl text-[clamp(3.6rem,8vw,7.6rem)] font-medium leading-[0.84] tracking-[-0.065em]">
                Every change,
                <span className="mt-3 block text-[#f04f2f]">fitted into place.</span>
              </h1>

              <p className="mt-8 max-w-xl text-base leading-7 text-[#4f4b42] dark:text-[#b8b4aa] sm:text-lg sm:leading-8">
                Inlaya turns GitHub issues into reviewed pull requests. Plan with an AI
                agent, build in a safe sandbox, and preview the result before it reaches
                your codebase.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <PrimaryAction />
              </div>

              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs font-medium text-[#625d53] dark:text-[#aaa69d]">
                {[
                  "Isolated workspaces",
                  "Live previews",
                  "Review-ready PRs",
                ].map((item) => (
                  <span key={item} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-[#f04f2f]" /> {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="inlaya-rise-delayed relative mx-auto w-full max-w-[640px]">
              <div className="absolute -left-4 -top-4 h-20 w-20 bg-[#f04f2f] sm:-left-7 sm:-top-7" />
              <div className="relative border border-[#171713] bg-[#171713] p-2 shadow-[16px_16px_0_rgba(23,23,19,0.12)] dark:border-[#fffaf0]/20 dark:shadow-[16px_16px_0_rgba(240,79,47,0.16)] sm:p-3 sm:shadow-[24px_24px_0_rgba(23,23,19,0.12)] sm:dark:shadow-[24px_24px_0_rgba(240,79,47,0.16)]">
                <div className="flex h-10 items-center justify-between border-b border-white/10 px-3 text-[#b8b4aa]">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em]">
                    <Terminal className="h-3.5 w-3.5 text-[#f04f2f]" />
                    Inlaya workspace
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#f04f2f]" />
                    <span className="text-[9px] uppercase tracking-[0.15em]">Live</span>
                  </div>
                </div>

                <div className="grid min-h-[390px] bg-[#201f1a] sm:grid-cols-[0.9fr_1.25fr]">
                  <div className="border-b border-white/10 p-4 sm:border-b-0 sm:border-r sm:p-5">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#817e75]">
                      GitHub issue #48
                    </p>
                    <h2 className="mt-3 text-lg font-semibold leading-snug text-[#fffaf0]">
                      Add repository search to the projects page
                    </h2>
                    <div className="mt-4 inline-flex border border-[#f04f2f]/40 bg-[#f04f2f]/10 px-2 py-1 text-[10px] font-medium text-[#ff8c73]">
                      enhancement
                    </div>
                    <div className="mt-7 space-y-3 text-xs leading-5 text-[#aaa69d]">
                      <p>Let users find an imported repository without scanning the full list.</p>
                      <div className="h-px bg-white/10" />
                      <p className="flex items-center gap-2 text-[#d3d0c7]">
                        <Github className="h-3.5 w-3.5" /> raghavvvgaba/Inlaya
                      </p>
                    </div>
                  </div>

                  <div className="relative overflow-hidden p-4 sm:p-5">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f04f2f] to-transparent inlaya-scan" />
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#817e75]">
                        Agent activity
                      </p>
                      <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-[#72c49a]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#72c49a]" /> running
                      </span>
                    </div>

                    <div className="mt-5 space-y-3">
                      <div className="border border-white/10 bg-white/[0.035] p-3">
                        <div className="flex items-center gap-2 text-[10px] text-[#8f8b82]">
                          <Layers3 className="h-3.5 w-3.5" /> Understanding the project
                        </div>
                        <p className="mt-2 font-mono text-[11px] leading-5 text-[#d7d3ca]">
                          Located the project list and existing repository filters.
                        </p>
                      </div>
                      <div className="border border-[#f04f2f]/25 bg-[#f04f2f]/[0.07] p-3">
                        <div className="flex items-center gap-2 text-[10px] text-[#ff8c73]">
                          <Code2 className="h-3.5 w-3.5" /> Editing 2 files
                        </div>
                        <div className="mt-3 space-y-2 font-mono text-[10px] text-[#bcb8af]">
                          <p><span className="mr-2 text-[#72c49a]">+</span>repository-search-bar.tsx</p>
                          <p><span className="mr-2 text-[#72c49a]">+</span>projects/page.tsx</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="border border-white/10 p-3">
                          <p className="text-[9px] uppercase tracking-[0.14em] text-[#817e75]">Preview</p>
                          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#fffaf0]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#72c49a]" /> Ready
                          </p>
                        </div>
                        <div className="border border-white/10 p-3">
                          <p className="text-[9px] uppercase tracking-[0.14em] text-[#817e75]">Changes</p>
                          <p className="mt-2 text-[11px] text-[#fffaf0]">
                            <span className="text-[#72c49a]">+84</span> <span className="text-[#ff7a68]">-3</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex h-12 items-center justify-between bg-[#fffaf0] px-4 text-[#171713]">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                    Ready for review
                  </span>
                  <span className="flex items-center gap-2 text-[11px] font-semibold">
                    Create pull request <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="meaning" className="border-b border-[#171713]/15 bg-[#171713] text-[#fffaf0] dark:border-[#fffaf0]/15 dark:bg-[#090907]">
          <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[0.72fr_1.28fr]">
            <div className="border-b border-white/15 p-8 sm:p-12 lg:border-b-0 lg:border-r lg:p-16">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f04f2f]">
                The name
              </p>
              <p className="inlaya-display mt-10 text-5xl font-medium tracking-[-0.05em] sm:text-7xl">
                inlay
              </p>
              <p className="mt-3 font-mono text-xs text-[#8f8b82]">/ˈɪnleɪ/ · noun & verb</p>
            </div>
            <div className="p-8 sm:p-12 lg:p-16">
              <p className="inlaya-display max-w-4xl text-3xl leading-[1.15] tracking-[-0.035em] sm:text-5xl">
                The craft of fitting a piece precisely into a surface, creating something
                stronger, richer, and whole.
              </p>
              <div className="mt-10 flex max-w-3xl items-start gap-4 border-l-2 border-[#f04f2f] pl-5 text-sm leading-7 text-[#b8b4aa] sm:text-base">
                <InlayaMark className="mt-1 h-5 w-5" />
                <p>
                  That is how Inlaya works: it brings the issue, the code, and the right
                  change together, then fits the result cleanly back into your repository.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="px-5 py-20 sm:px-8 sm:py-28 lg:px-12 lg:py-32">
          <div className="mx-auto max-w-[1344px]">
            <div className="grid gap-6 border-b border-[#171713]/20 pb-10 dark:border-[#fffaf0]/20 md:grid-cols-[0.8fr_1.2fr] md:items-end">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f04f2f]">
                  One coherent workflow
                </p>
                <h2 className="inlaya-display mt-4 text-5xl font-medium tracking-[-0.05em] sm:text-6xl">
                  From open issue<br />to open PR.
                </h2>
              </div>
              <p className="max-w-xl text-base leading-7 text-[#5f5a50] dark:text-[#aaa69d] md:justify-self-end">
                No handoffs between disconnected tools. Inlaya keeps the conversation,
                sandbox, code changes, preview, and submission in one place.
              </p>
            </div>

            <div className="mt-10 grid gap-px bg-[#171713]/20 dark:bg-[#fffaf0]/20 lg:grid-cols-3">
              {workflow.map((step) => {
                const Icon = step.icon;
                return (
                  <article
                    key={step.number}
                    className="group relative min-h-[360px] overflow-hidden bg-[#f3efe5] p-7 transition-colors hover:bg-[#fffaf0] dark:bg-[#11110f] dark:hover:bg-[#1b1a16] sm:p-9"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-[#827c70] dark:text-[#8f8b82]">{step.number}</span>
                      <Icon className="h-5 w-5 text-[#f04f2f]" />
                    </div>
                    <div className="mt-24">
                      <h3 className="inlaya-display text-3xl font-medium tracking-[-0.035em]">
                        {step.title}
                      </h3>
                      <p className="mt-4 max-w-sm text-sm leading-6 text-[#625d53] dark:text-[#aaa69d]">
                        {step.description}
                      </p>
                    </div>
                    <div className="absolute bottom-0 left-0 h-1 w-0 bg-[#f04f2f] transition-all duration-500 group-hover:w-full" />
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="safety" className="px-5 pb-20 sm:px-8 sm:pb-28 lg:px-12 lg:pb-32">
          <div className="relative mx-auto max-w-[1344px] overflow-hidden bg-[#e6ddca] p-8 dark:bg-[#24221d] sm:p-12 lg:p-16">
            <div className="absolute -bottom-40 -right-24 h-80 w-80 rotate-45 border-[48px] border-[#f04f2f]/15" />
            <div className="relative grid gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-center">
              <div>
                <div className="flex h-11 w-11 items-center justify-center bg-[#171713] text-[#fffaf0] dark:bg-[#fffaf0] dark:text-[#171713]">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h2 className="inlaya-display mt-7 max-w-2xl text-4xl font-medium leading-[1.04] tracking-[-0.045em] sm:text-6xl">
                  Freedom to build.<br />Boundaries by design.
                </h2>
              </div>
              <div className="grid gap-3">
                {[
                  "Each project runs in an isolated cloud sandbox.",
                  "Every change is visible in the live preview.",
                  "Your repository stays untouched until you submit the PR.",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 border-t border-[#171713]/20 py-4 text-sm leading-6 dark:border-[#fffaf0]/20"
                  >
                    <Check className="mt-1 h-4 w-4 shrink-0 text-[#f04f2f]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-[#171713]/15 bg-[#f04f2f] px-5 py-20 text-[#171713] dark:border-[#fffaf0]/15 sm:px-8 sm:py-28 lg:px-12">
          <div className="mx-auto flex max-w-[1100px] flex-col items-center text-center">
            <InlayaMark className="h-10 w-10" />
            <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.22em]">
              The next change starts here
            </p>
            <h2 className="inlaya-display mt-4 text-5xl font-medium leading-[0.95] tracking-[-0.055em] sm:text-7xl lg:text-8xl">
              Fit the right change<br />into place.
            </h2>
            <div className="mt-9">
              <PrimaryAction />
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#171713] px-5 py-8 text-[#fffaf0] sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1344px] flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <InlayaMark className="h-6 w-6" />
            <span className="inlaya-display text-lg font-medium">Inlaya</span>
          </div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#817e75]">
            Precise changes, fitted into place · © {new Date().getFullYear()}
          </p>
          <a
            href="https://github.com/raghavvvgaba/Inlaya"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs text-[#b8b4aa] transition-colors hover:text-[#fffaf0]"
          >
            <Github className="h-4 w-4" /> GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
