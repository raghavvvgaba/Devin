"use client";

import Link from "next/link";
import { Github, Loader2, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { RepoImportItem } from "~/server/github/repos";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

type RepositorySearchBarProps = {
  repositories: RepoImportItem[];
  importedProjects: Record<string, string>;
  githubAppInstallUrl: string;
  disabled: boolean;
};

export function RepositorySearchBar({
  repositories,
  importedProjects,
  githubAppInstallUrl,
  disabled,
}: RepositorySearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [importingRepo, setImportingRepo] = useState<string | null>(null);

  const handleImport = useCallback(
    async (repoOwner: string, repoName: string, repoFullName: string) => {
      setImportingRepo(repoFullName);

      try {
        const formData = new FormData();
        formData.set("repoOwner", repoOwner);
        formData.set("repoName", repoName);

        const response = await fetch("/projects", {
          method: "POST",
          body: formData,
          headers: {
            Accept: "application/json",
          },
        });

        const result = (await response.json()) as {
          error?: string;
          projectUrl?: string;
        };

        if (!response.ok || result.error || !result.projectUrl) {
          const messages: Record<string, string> = {
            github_required: "Connect GitHub before importing.",
            github_repo_fetch_failed: "Could not fetch repository list.",
            missing_repo_selection: "Choose a repository.",
            refresh_import_session: "Session expired. Refresh access.",
            repo_needs_access: "Grant the GitHub App access first.",
            repo_not_in_session: "Repo not in current session.",
          };

          toast.error(
            result.error ? (messages[result.error] ?? "Import failed.") : "Import failed.",
          );
          setImportingRepo(null);
          return;
        }

        toast.success("Repository imported.");
        router.push(result.projectUrl);
      } catch {
        toast.error("Something went wrong.");
        setImportingRepo(null);
      }
    },
    [router],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? repositories.filter((repo) =>
        repo.fullName.toLowerCase().includes(normalizedQuery),
      )
    : repositories;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 rounded-none border-border bg-input/50 pl-10 pr-10 text-sm"
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              disabled
                ? "No repositories available to search"
                : "Search repositories..."
            }
            value={query}
          />
          {query && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setQuery("")}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Badge className="h-10 shrink-0 bg-muted text-muted-foreground border-border rounded-none text-[10px] font-bold uppercase tracking-widest px-3 py-1">
          {normalizedQuery
            ? `${filtered.length} of ${repositories.length} Repositories`
            : `${repositories.length} Repositories`}
        </Badge>
      </div>

      <div className="grid gap-px bg-border border border-border">
        {filtered.length === 0 && (
          <div className="bg-card py-12 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {normalizedQuery
                ? "No Repositories Match Your Search"
                : "No Repositories Found"}
            </p>
            <p className="mt-2 text-[10px] text-muted-foreground uppercase">
              {normalizedQuery
                ? "Try a different search term."
                : "Refresh access or choose another owner."}
            </p>
          </div>
        )}

        {filtered.map((repo) => {
          const importedProjectId =
            importedProjects[repo.fullName.toLowerCase()];

          return (
            <div
              className="flex flex-col gap-6 bg-card p-6 md:flex-row md:items-center md:justify-between group transition hover:bg-muted/50"
              key={repo.id}
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center bg-muted border border-border group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Github className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-bold tracking-tight uppercase">
                    {repo.fullName}
                  </h3>
                  <Badge
                    className={`rounded-none text-[10px] font-bold uppercase tracking-widest ${
                      importedProjectId
                        ? "bg-primary/10 text-primary border-primary/20"
                        : repo.status === "ready"
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                    }`}
                  >
                    {importedProjectId
                      ? "IMPORTED"
                      : repo.status === "ready"
                        ? "READY"
                        : "LOCKED"}
                  </Badge>
                  {repo.private && (
                    <Badge
                      variant="outline"
                      className="border-border text-[10px] font-bold uppercase tracking-widest rounded-none text-muted-foreground"
                    >
                      PRIVATE
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex shrink-0">
                {importedProjectId ? (
                  <Button
                    asChild
                    variant="outline"
                    className="border-border font-bold uppercase text-[10px] tracking-widest h-10 rounded-none px-6"
                  >
                    <Link href={`/projects/${importedProjectId}`}>
                      Open Project
                    </Link>
                  </Button>
                ) : repo.status === "ready" ? (
                  <Button
                    className="bg-primary text-primary-foreground font-bold uppercase text-[10px] tracking-widest h-10 rounded-none px-8"
                    disabled={importingRepo === repo.fullName}
                    onClick={() =>
                      handleImport(repo.owner, repo.name, repo.fullName)
                    }
                  >
                    {importingRepo === repo.fullName ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-3.5 w-3.5" />
                    )}
                    {importingRepo === repo.fullName
                      ? "Importing..."
                      : "Import Repository"}
                  </Button>
                ) : (
                  <Button
                    asChild
                    variant="outline"
                    className="border-amber-500/20 text-amber-500 hover:bg-amber-500/10 font-bold uppercase text-[10px] tracking-widest h-10 rounded-none px-6"
                  >
                    <a
                      href={githubAppInstallUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Unlock Access
                    </a>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
