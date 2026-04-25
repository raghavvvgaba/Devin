import { getAuth } from "~/server/auth/session";

export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { userId, redirectToSignIn } = await getAuth();

  if (!userId) {
    return redirectToSignIn();
  }

  return children;
}
