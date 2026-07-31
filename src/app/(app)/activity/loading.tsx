import { AppShell } from "~/components/app-shell";
import { Skeleton } from "~/components/ui/skeleton";

export default function ActivityLoading() {
  return (
    <AppShell compactHeader description="" title="Activity">
      <div className="space-y-8">
        <section className="space-y-3 border-b border-border pb-7">
          <Skeleton className="h-3 w-28 rounded-none" />
          <Skeleton className="h-14 w-56 rounded-none" />
          <Skeleton className="h-4 w-full max-w-xl rounded-none" />
        </section>
        <section className="grid gap-px border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton
              className="h-40 rounded-none bg-card"
              key={`activity-metric-${index}`}
            />
          ))}
        </section>
        <section className="space-y-4">
          <Skeleton className="h-9 w-48 rounded-none" />
          <div className="space-y-px border border-border bg-border">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton
                className="h-24 rounded-none bg-card"
                key={`activity-run-${index}`}
              />
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
