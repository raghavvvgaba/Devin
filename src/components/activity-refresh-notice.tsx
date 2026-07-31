"use client";

import { Info, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "~/components/ui/button";

function formatRefreshTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ActivityRefreshNotice({
  initialRefreshedAt,
}: {
  initialRefreshedAt: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastRefreshedAt, setLastRefreshedAt] =
    useState(initialRefreshedAt);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending) {
      setLastRefreshedAt(new Date().toISOString());
    }

    wasPending.current = isPending;
  }, [isPending]);

  function refreshActivity() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <aside className="flex flex-col gap-4 border border-border bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#f04f2f]/30 bg-[#f04f2f]/10 text-[#f04f2f]">
          <Info className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold">
            This view does not update automatically
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Refresh to load the latest agent runs, tool calls, and usage from
            the database.
          </p>
          <p
            className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/75"
            suppressHydrationWarning
          >
            Last refreshed at {formatRefreshTime(lastRefreshedAt)}
          </p>
        </div>
      </div>

      <Button
        className="h-9 rounded-none border-border px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] sm:shrink-0"
        disabled={isPending}
        onClick={refreshActivity}
        type="button"
        variant="outline"
      >
        {isPending ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {isPending ? "Refreshing…" : "Refresh activity"}
      </Button>
    </aside>
  );
}
