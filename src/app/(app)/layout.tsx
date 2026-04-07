import { auth } from "@clerk/nextjs/server";

import { syncCurrentUser } from "~/server/auth/sync-user";

export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn();
  }

  await syncCurrentUser();

  return children;
}
