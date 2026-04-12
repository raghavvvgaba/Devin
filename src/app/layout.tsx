import "~/styles/globals.css";

import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { type Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { cn } from "~/lib/utils";

const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono'});

export const metadata: Metadata = {
  title: "Devin",
  description: "A simple GitHub contribution layer for non-technical users.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("font-mono", jetbrainsMono.variable)}>
      <body className="antialiased">
        <ClerkProvider>
          <header className="flex h-16 items-center justify-end gap-4 border-b border-slate-200 bg-white/80 px-4 backdrop-blur">
            <SignedOut>
              <SignInButton />
              <SignUpButton>
                <button className="cursor-pointer rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 sm:px-5 sm:text-base">
                  Sign Up
                </button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
