import { AppShell } from "~/components/app-shell";
import { Skeleton } from "~/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <AppShell description="" title="Dashboard">
      <div className="flex justify-end pb-8">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24 rounded-none" />
          <Skeleton className="h-6 w-24 rounded-none" />
          <Skeleton className="h-6 w-24 rounded-none" />
        </div>
      </div>

      <section className="space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20 rounded-none" />
            <Skeleton className="h-7 w-56 rounded-none" />
          </div>
          <Skeleton className="h-10 w-32 rounded-none" />
        </div>

        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              className="flex items-center justify-between border border-border bg-card p-4"
              key={`dashboard-loading-${index}`}
            >
              <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-none" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48 rounded-none" />
                  <Skeleton className="h-3 w-28 rounded-none" />
                </div>
              </div>
              <Skeleton className="h-10 w-10 rounded-none" />
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
