import Link from "next/link";
import { Github, CheckCircle2, Circle, ArrowRight, ExternalLink, Unlink } from "lucide-react";

import { AppShell } from "~/components/app-shell";
import { env } from "~/env";
import { getAuth } from "~/server/auth/session";
import { getGithubConnectionStatus } from "~/server/github/connection";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";

const milestones = [
  "Authorize the GitHub App on your user account",
  "Install the app on the target account or organization",
  "Return here and initialize repository import",
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
  const { userId } = await getAuth();
  const params = await searchParams;
  const status = await getGithubConnectionStatus(userId!);

  const errorMessage = params.error ? errorMessages[params.error] : null;
  const successMessage =
    params.success === "connected"
      ? "GitHub identity successfully mapped to Clerk session."
      : params.success === "disconnected"
        ? "GitHub identity unmapped. Local project records purged."
        : null;
  const nextStepMessage = !status.connected
    ? "Connect your GitHub account to unlock repository import."
    : "Install the GitHub App and continue to repository import.";

  return (
    <AppShell
      description="Initialize secure GitHub identity mapping and app installation for repository access."
      title="GitHub Onboarding"
    >
      <Alert className="rounded-none border-primary/20 bg-primary/5">
        <Github className="h-4 w-4 text-primary" />
        <AlertTitle className="text-[10px] font-bold uppercase tracking-widest">
          Next Step
        </AlertTitle>
        <AlertDescription className="text-xs font-medium uppercase mt-2 leading-relaxed">
          {nextStepMessage}
        </AlertDescription>
      </Alert>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Card className="rounded-none border-border shadow-none bg-card">
            <CardHeader className="border-b border-border pb-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Configuration
                </p>
                <CardTitle className="text-xl uppercase tracking-tight">Identity Mapping</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-6">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  This procedure links your authenticated Clerk session to a GitHub identity. 
                  Minimal connection metadata is stored locally; GitHub remains the 
                  authoritative source for repository data and issue state.
                </p>

                <div className="border border-border bg-muted/30 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      System State
                    </p>
                    {status.connected ? (
                      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 rounded-none text-[10px] font-bold uppercase tracking-widest">
                        Mapped
                      </Badge>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground border-border rounded-none text-[10px] font-bold uppercase tracking-widest">
                        Unmapped
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center bg-background border border-border">
                      <Github className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold uppercase tracking-tight">
                        {status.connected ? `@${status.githubUsername}` : "Anonymous"}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase">
                        {status.connected ? "Identity Verified" : "Awaiting Authorization"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border shadow-none bg-card">
            <CardHeader className="border-b border-border pb-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Procedures
                </p>
                <CardTitle className="text-xl uppercase tracking-tight">System Actions</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-4">
                {!status.connected ? (
                  <Button asChild className="bg-primary text-primary-foreground font-bold uppercase text-[10px] tracking-widest h-12 rounded-none px-8">
                    <a href="/api/github/connect">
                      Initialize Connection
                    </a>
                  </Button>
                ) : (
                  <>
                    <Button asChild className="bg-primary text-primary-foreground font-bold uppercase text-[10px] tracking-widest h-12 rounded-none px-8">
                      <a href={env.GITHUB_APP_INSTALL_URL} rel="noreferrer" target="_blank">
                        Install GitHub App
                        <ExternalLink className="ml-2 h-3.5 w-3.5" />
                      </a>
                    </Button>
                    <Button asChild variant="outline" className="border-border font-bold uppercase text-[10px] tracking-widest h-12 rounded-none px-8">
                      <Link href="/projects/new">
                        Project Import
                        <ArrowRight className="ml-2 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <form
                      action="/api/github/disconnect?returnTo=/onboarding/github"
                      method="post"
                      className="w-full sm:w-auto"
                    >
                      <Button variant="outline" className="w-full sm:w-auto border-destructive/20 text-destructive hover:bg-destructive/10 font-bold uppercase text-[10px] tracking-widest h-12 rounded-none px-8">
                        <Unlink className="mr-2 h-3.5 w-3.5" />
                        Disconnect
                      </Button>
                    </form>
                  </>
                )}
              </div>
              
              {status.connected && (
                <p className="mt-6 text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-relaxed">
                  Note: If target repositories reside within an Organization, ensure the 
                  GitHub App is installed on that specific Organization.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {errorMessage && (
            <Alert variant="destructive" className="rounded-none border-destructive/20 bg-destructive/10">
              <AlertTitle className="text-[10px] font-bold uppercase tracking-widest">System Error</AlertTitle>
              <AlertDescription className="text-xs font-medium uppercase mt-2 leading-relaxed">
                {errorMessage}
              </AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert className="rounded-none border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
              <AlertTitle className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Operation Success</AlertTitle>
              <AlertDescription className="text-xs font-medium uppercase mt-2 leading-relaxed">
                {successMessage}
              </AlertDescription>
            </Alert>
          )}

          <Card className="rounded-none border-border shadow-none bg-card">
            <CardHeader className="border-b border-border pb-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Roadmap
                </p>
                <CardTitle className="text-xl uppercase tracking-tight">Sequence</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {milestones.map((milestone, index) => {
                  const isDone = status.connected && index === 0;
                  return (
                    <div
                      className={`flex gap-4 border border-border p-4 transition ${isDone ? 'bg-muted/30 opacity-60' : 'bg-background'}`}
                      key={milestone}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center text-[10px] font-bold ${isDone ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'}`}>
                        0{index + 1}
                      </span>
                      <p className={`text-xs font-bold uppercase tracking-tight leading-relaxed ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                        {milestone}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </AppShell>
  );
}
