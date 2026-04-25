import { AppShell } from "~/components/app-shell";
import { Skeleton } from "~/components/ui/skeleton";

export default function IssueLoading() {
  return (
    <AppShell compactHeader contentWidth="full" description="" fullHeight title="Issue">
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="mb-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <Skeleton className="h-10 w-28 rounded-none" />
            <Skeleton className="h-10 w-10 rounded-none" />
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-8 w-80 rounded-none" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>

        <div className="flex flex-1 flex-col overflow-hidden border border-border bg-card">
          <div className="space-y-4 border-b border-border p-6">
            <Skeleton className="h-4 w-24 rounded-none" />
            <Skeleton className="h-4 w-2/3 rounded-none" />
            <Skeleton className="h-4 w-1/2 rounded-none" />
          </div>
          <div className="flex-1 space-y-4 p-6">
            <Skeleton className="h-24 w-full rounded-none" />
            <Skeleton className="h-24 w-full rounded-none" />
          </div>
        </div>
      </section>
    </AppShell>
  );
}
