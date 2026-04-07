import { redirect } from "next/navigation";

import { getGithubConnectionStatus } from "~/server/github/connection";

export async function requireGithubConnection(userId: string) {
  const status = await getGithubConnectionStatus(userId);

  if (!status.connected) {
    redirect("/onboarding/github?error=github_required");
  }

  return status;
}
