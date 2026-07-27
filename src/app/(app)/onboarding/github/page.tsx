import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Github,
  Unlink,
} from "lucide-react";

import { AppShell } from "~/components/app-shell";
import { GithubOnboardingToast } from "~/components/github-onboarding-toast";
import { InlayaMark } from "~/components/inlaya-mark";
import { Button } from "~/components/ui/button";
import { env } from "~/env";
import { getAuth } from "~/server/auth/session";
import { getGithubOnboardingPageData } from "~/server/projects";

type GithubOnboardingPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default async function GithubOnboardingPage({
  searchParams,
}: GithubOnboardingPageProps) {
  const { userId } = await getAuth();
  const params = await searchParams;
  const { errorMessage, status, successMessage } =
    await getGithubOnboardingPageData(userId!, params);

  return (
    <AppShell compactHeader contentWidth="full" title="Connect GitHub">
      <GithubOnboardingToast
        errorMessage={errorMessage}
        successMessage={successMessage}
      />

      <main className="inlaya-landing -m-6 grid min-h-[calc(100vh-3.5rem)] place-items-center overflow-hidden bg-[#f3efe5] px-6 py-12 text-[#171713] selection:bg-[#f04f2f] selection:text-white dark:bg-[#11110f] dark:text-[#f3efe5] sm:px-10 lg:-m-8 lg:px-14">
        <div className="mx-auto grid w-full max-w-5xl items-center gap-14 lg:grid-cols-[1fr_0.82fr] lg:gap-20">
          <section className="inlaya-rise">
            <div className="mb-8 flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6d675d] dark:text-[#aaa69d]">
              <InlayaMark className="h-4 w-4" />
              GitHub connection
            </div>

            <h1 className="inlaya-display text-6xl font-medium leading-[0.9] tracking-[-0.06em] sm:text-7xl lg:text-[5.5rem]">
              {status.connected ? (
                <>
                  GitHub is
                  <span className="block text-[#f04f2f]">connected.</span>
                </>
              ) : (
                <>
                  Connect
                  <span className="block text-[#f04f2f]">GitHub.</span>
                </>
              )}
            </h1>

            <p className="mt-6 max-w-md text-base leading-7 text-[#625d53] dark:text-[#aaa69d]">
              {status.connected
                ? `@${status.githubUsername} is ready to import repositories.`
                : "Import a repository and start working on its issues."}
            </p>

            <div className="mt-10 border-t border-[#171713]/20 pt-6 dark:border-[#fffaf0]/20">
              {status.connected ? (
                <div className="mb-6 flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  @{status.githubUsername}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {!status.connected ? (
                  <Button
                    asChild
                    className="group h-12 rounded-none bg-[#171713] px-6 text-sm font-semibold text-[#fffaf0] hover:bg-[#f04f2f] dark:bg-[#fffaf0] dark:text-[#171713] dark:hover:bg-[#f04f2f]"
                  >
                    <a href="/api/github/connect">
                      Continue with GitHub
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </a>
                  </Button>
                ) : (
                  <>
                    <Button
                      asChild
                      className="h-12 rounded-none bg-[#171713] px-6 text-sm font-semibold text-[#fffaf0] hover:bg-[#f04f2f] dark:bg-[#fffaf0] dark:text-[#171713] dark:hover:bg-[#f04f2f]"
                    >
                      <a
                        href={env.GITHUB_APP_INSTALL_URL}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Choose repositories
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="group h-12 rounded-none border-[#171713]/25 bg-transparent px-6 text-sm font-semibold hover:bg-[#171713]/5 dark:border-[#fffaf0]/25 dark:hover:bg-white/5"
                    >
                      <Link href="/projects?newImport=true">
                        Import repository
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </Link>
                    </Button>
                  </>
                )}
              </div>

              {status.connected ? (
                <form
                  action="/api/github/disconnect?returnTo=/onboarding/github"
                  className="mt-5"
                  method="post"
                >
                  <Button
                    variant="ghost"
                    className="h-auto rounded-none px-0 py-1 text-xs font-medium text-[#777167] hover:bg-transparent hover:text-destructive dark:text-[#8f8b82]"
                  >
                    <Unlink className="mr-2 h-3.5 w-3.5" />
                    Disconnect
                  </Button>
                </form>
              ) : null}
            </div>
          </section>

          <div
            aria-hidden="true"
            className="inlaya-rise-delayed relative mx-auto aspect-square w-full max-w-[430px]"
          >
            <div className="absolute inset-0 translate-x-3 translate-y-3 bg-[#f04f2f] sm:translate-x-5 sm:translate-y-5" />
            <div className="relative grid h-full place-items-center overflow-hidden border border-[#171713] bg-[#171713] text-[#fffaf0] dark:border-[#fffaf0]/20 dark:bg-[#090907]">
              <div className="absolute -right-[28%] -top-[28%] h-[72%] w-[72%] rotate-45 border border-white/10" />
              <div className="absolute -bottom-[34%] -left-[34%] h-[80%] w-[80%] rotate-45 border border-white/10" />
              <div className="absolute left-0 top-0 h-1 w-24 bg-[#f04f2f]" />
              <Github className="relative h-28 w-28 sm:h-36 sm:w-36" strokeWidth={1.25} />
              <InlayaMark className="absolute bottom-6 right-6 h-8 w-8 sm:bottom-8 sm:right-8 sm:h-10 sm:w-10" />
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
