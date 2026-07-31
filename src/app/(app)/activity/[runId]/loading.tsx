import { AppShell } from "~/components/app-shell";
import { Skeleton } from "~/components/ui/skeleton";

export default function ActivityRunLoading() {
  return (
    <AppShell compactHeader description="" title="Run trace">
      <div className="space-y-7">
        <section className="space-y-4 border-b border-border pb-7">
          <Skeleton className="h-3 w-32 rounded-none" />
          <Skeleton className="h-12 w-56 rounded-none" />
          <Skeleton className="h-4 w-full max-w-2xl rounded-none" />
        </section>
        <section className="grid gap-px border border-border bg-border sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton
              className="h-24 rounded-none bg-card"
              key={`run-metric-${index}`}
            />
          ))}
        </section>
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-px border border-border bg-border">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton
                className="h-32 rounded-none bg-card"
                key={`trace-event-${index}`}
              />
            ))}
          </div>
          <Skeleton className="h-80 rounded-none" />
        </section>
      </div>
    </AppShell>
  );
}
