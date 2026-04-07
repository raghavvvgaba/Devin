import { SignIn } from "@clerk/nextjs";

import { AuthShell } from "~/components/auth-shell";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <AuthShell
      description="Sign in to access your protected workspace, sync your app user record, and continue toward the GitHub onboarding flow."
      eyebrow="Authentication"
      title="Welcome back to Devin"
    >
      <SignIn
        appearance={{
          elements: {
            card: "shadow-none",
            rootBox: "w-full",
          },
        }}
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
      />
    </AuthShell>
  );
}
