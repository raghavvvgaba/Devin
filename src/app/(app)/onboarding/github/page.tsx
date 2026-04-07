import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { AppShell } from "~/components/app-shell";
import { env } from "~/env";
import { getGithubConnectionStatus } from "~/server/github/connection";

const milestones = [
  "Authorize the GitHub App on your user account",
  "Install the app on the account or organization that owns your repository",
  "Return here and continue to repository import",
];

const errorMessages: Record<string, string> = {
  access_denied:
    "GitHub authorization was cancelled before the app could connect your account.",
  github_connect_failed:
    "GitHub connection did not complete successfully. Please try again.",
  github_required: "Connect GitHub before importing a repository.",
  invalid_state:
    "The GitHub callback could not be verified. Please restart the connection flow.",
  missing_callback_params:
    "GitHub did not return the expected callback parameters.",
  missing_code_verifier:
    "The secure GitHub verification data expired. Please try connecting again.",
  token_exchange_failed: "GitHub did not return a usable access token.",
  user_fetch_failed:
    "GitHub connected, but the user profile lookup failed afterward.",
};

type GithubOnboardingPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default async function GithubOnboardingPage({
  searchParams,
}: GithubOnboardingPageProps) {
  const { userId } = await auth();
  const params = await searchParams;
  const status = await getGithubConnectionStatus(userId!);

  const errorMessage = params.error ? errorMessages[params.error] : null;
  const successMessage =
    params.success === "connected"
      ? "GitHub connected successfully. You can now move on to repository import."
      : params.success === "disconnected"
        ? "GitHub has been disconnected and imported projects for this user were removed."
        : null;

  return (
    <AppShell
      description="Connect your GitHub identity now, then install the GitHub App anywhere you want to import repositories from in the next phase."
      title="GitHub Onboarding"
    >
      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">
            Phase 2
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            Connect GitHub
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            This step links the authenticated Clerk user to a GitHub identity.
            The app stores only minimal connection state locally, while GitHub
            remains the source of truth for repositories and issues.
          </p>

          <div className="mt-6 rounded-3xl bg-white/10 p-5">
            <p className="text-sm text-slate-300">Connection status</p>
            <p className="mt-2 text-xl font-semibold">
              {status.connected
                ? `Connected as ${status.githubUsername}`
                : "Not connected yet"}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {status.connected
                ? "Next, install the GitHub App anywhere you want to import repositories from."
                : "Start by authorizing the GitHub App with your GitHub user account."}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {errorMessage ? (
            <div className="rounded-[2rem] border border-rose-200 bg-rose-50 p-5 text-sm leading-7 text-rose-800 shadow-sm">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 text-sm leading-7 text-emerald-800 shadow-sm">
              {successMessage}
            </div>
          ) : null}

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <ol className="space-y-4">
              {milestones.map((milestone, index) => (
                <li
                  className="flex gap-4 rounded-2xl bg-slate-50 p-4"
                  key={milestone}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-slate-700">{milestone}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Actions
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {!status.connected ? (
                <Link
                  className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  href="/api/github/connect"
                >
                  Connect GitHub
                </Link>
              ) : (
                <>
                  <a
                    className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    href={env.GITHUB_APP_INSTALL_URL}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Install GitHub App
                  </a>
                  <Link
                    className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold transition hover:border-slate-950"
                    href="/projects/new"
                  >
                    Continue to import
                  </Link>
                  <form
                    action="/api/github/disconnect?returnTo=/onboarding/github"
                    method="post"
                  >
                    <button
                      className="rounded-full border border-rose-300 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:border-rose-500 hover:text-rose-800"
                      type="submit"
                    >
                      Disconnect GitHub
                    </button>
                  </form>
                </>
              )}
            </div>

            {status.connected ? (
              <p className="mt-4 text-sm leading-7 text-slate-600">
                If the target repository lives in an organization, install the
                app on that organization before continuing.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
