import { SignUp } from "@clerk/nextjs";

import { AuthShell } from "~/components/auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell
      description="Create an account to enter the MVP workspace and begin the GitHub onboarding flow."
      eyebrow="Phase 1"
      title="Create your Devin workspace"
    >
      <SignUp
        appearance={{
          elements: {
            card: "shadow-none",
            rootBox: "w-full",
          },
        }}
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
      />
    </AuthShell>
  );
}
