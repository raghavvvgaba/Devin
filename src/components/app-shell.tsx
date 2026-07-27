"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";

import { InlayaMark } from "~/components/inlaya-mark";
import { ModeToggle } from "~/components/mode-toggle";
import { Separator } from "~/components/ui/separator";
import { cn } from "~/lib/utils";

type AppShellProps = {
  title: string;
  description?: string;
  compactHeader?: boolean;
  contentWidth?: "default" | "full";
  children: ReactNode;
  fullHeight?: boolean;
};

export function AppShell({
  title,
  description,
  compactHeader = false,
  contentWidth = "default",
  children,
  fullHeight = false,
}: AppShellProps) {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <header className="relative z-20 h-16 shrink-0 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="flex h-full w-full items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center">
            <Link
              className="group flex shrink-0 items-center gap-2.5"
              href="/projects"
            >
              <InlayaMark className="h-5 w-5 transition-transform duration-300 group-hover:rotate-45" />
              <span className="inlaya-display text-xl font-medium tracking-[-0.035em]">
                Inlaya
              </span>
            </Link>

            <span
              aria-hidden="true"
              className="mx-3 text-sm text-border sm:mx-4"
            >
              /
            </span>
            <p className="truncate text-xs font-medium text-muted-foreground">
              {title}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ModeToggle />
            <div className="h-8 w-px bg-border" />
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  userButtonAvatarBox:
                    "h-8 w-8 rounded-none border border-border",
                  userButtonTrigger:
                    "rounded-none focus:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                },
              }}
            />
          </div>
        </div>
        <div className="absolute bottom-[-1px] left-4 h-px w-14 bg-[#f04f2f] sm:left-6 lg:left-8" />
      </header>
      <main
        className={cn(
          "flex min-h-0 flex-1 flex-col p-6 lg:p-8",
          !fullHeight && "overflow-y-auto",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 w-full flex-1 flex-col",
            !fullHeight && "space-y-8",
            contentWidth === "default" ? "mx-auto max-w-6xl" : "max-w-none",
          )}
        >
          {!compactHeader ? (
            <>
              {description ? (
                <div className="flex flex-col gap-2">
                  <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </div>
              ) : null}
              <Separator className="bg-border/50" />
            </>
          ) : null}
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              fullHeight && "overflow-hidden",
            )}
          >
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
