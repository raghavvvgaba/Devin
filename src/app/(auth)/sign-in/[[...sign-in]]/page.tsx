"use client";

import { SignIn } from "@clerk/nextjs";

import { AuthShell } from "~/components/auth-shell";

export default function SignInPage() {
  return (
    <AuthShell
      description="Sign in to access your protected workspace and continue toward the GitHub onboarding flow."
      eyebrow="Authentication"
      title="Welcome back to Inlaya"
    >
      <SignIn
        appearance={{
          elements: {
            card: "shadow-none",
            rootBox: "flex w-full justify-center",
          },
        }}
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
      />
    </AuthShell>
  );
}
