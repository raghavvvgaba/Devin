import { AppShell } from "~/components/app-shell";
import { Skeleton } from "~/components/ui/skeleton";

export default function ProjectLoading() {
  return (
    <AppShell compactHeader description="" title="Project">
      <div className="space-y-7">
        <section className="space-y-4 border-b border-border pb-5">
          <div className="flex items-start justify-between gap-4">
            <Skeleton className="h-10 w-40 rounded-none" />
            <Skeleton className="h-10 w-10 rounded-none" />
          </div>

          <div className="space-y-2">
            <Skeleton className="h-8 w-72 rounded-none" />
            <Skeleton className="h-3 w-40 rounded-none" />
          </div>
        </section>

        <div className="space-y-6">
          <div className="border-b border-border pb-5">
            <Skeleton className="h-6 w-40 rounded-none" />
          </div>

          <div className="grid gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                className="space-y-4 border border-border bg-card p-6"
                key={`project-loading-${index}`}
              >
                <Skeleton className="h-4 w-16 rounded-none" />
                <Skeleton className="h-5 w-2/3 rounded-none" />
                <div className="flex flex-wrap gap-3">
                  <Skeleton className="h-4 w-20 rounded-none" />
                  <Skeleton className="h-4 w-24 rounded-none" />
                  <Skeleton className="h-4 w-24 rounded-none" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
