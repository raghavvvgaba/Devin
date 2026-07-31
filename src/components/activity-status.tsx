import { Check, CircleAlert, LoaderCircle, OctagonX } from "lucide-react";

import { cn } from "~/lib/utils";

const statusConfig: Record<
  string,
  {
    className: string;
    icon: typeof Check;
    label: string;
  }
> = {
  blocked: {
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    icon: CircleAlert,
    label: "Blocked",
  },
  completed: {
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: Check,
    label: "Completed",
  },
  failed: {
    className:
      "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    icon: OctagonX,
    label: "Failed",
  },
  running: {
    className:
      "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    icon: LoaderCircle,
    label: "Running",
  },
};

export function ActivityStatus({
  className,
  status,
}: {
  className?: string;
  status: string;
}) {
  const config = statusConfig[status] ?? {
    className: "border-border bg-muted text-muted-foreground",
    icon: CircleAlert,
    label: status,
  };
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 border px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]",
        config.className,
        className,
      )}
    >
      <Icon
        className={cn("h-3 w-3", status === "running" && "animate-spin")}
      />
      {config.label}
    </span>
  );
}
