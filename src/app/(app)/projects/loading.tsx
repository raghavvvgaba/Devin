import { AppShell } from "~/components/app-shell";
import { Skeleton } from "~/components/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <AppShell compactHeader description="" title="Projects">
      <div className="space-y-8 pb-8">
        <section className="flex items-end justify-between border-b border-border pb-7">
          <div>
            <Skeleton className="h-14 w-48 rounded-none" />
            <Skeleton className="mt-3 h-4 w-24 rounded-none" />
          </div>
          <Skeleton className="h-11 w-44 rounded-none" />
        </section>

        <Skeleton className="h-16 w-full rounded-none" />

        <section className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton
              className="h-[180px] rounded-none"
              key={`projects-loading-${index}`}
            />
          ))}
        </section>
      </div>
    </AppShell>
  );
}
