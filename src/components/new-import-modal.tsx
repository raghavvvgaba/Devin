"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Database,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  fetchImportModalData,
  type ImportModalData,
} from "~/app/(app)/projects/actions";
import { ImportGuidePopup } from "~/components/import-guide-popup";
import { RepositoryOwnerFilter } from "~/components/repository-owner-filter";
import { RepositorySearchBar } from "~/components/repository-search-bar";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

type NewImportModalProps = {
  defaultOpen?: boolean;
  githubAppInstallUrl: string;
  trigger: React.ReactNode;
};

export function NewImportModal({
  defaultOpen = false,
  githubAppInstallUrl,
  trigger,
}: NewImportModalProps) {
  const [data, setData] = useState<ImportModalData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [selectedOwner, setSelectedOwner] = useState("");
  const importAccessOpenedRef = useRef(false);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const wasOpenRef = useRef(false);
  const searchParams = useSearchParams();
  const successParam = searchParams.get("success");

  const loadData = useCallback(async (refresh = false) => {
    if (loadPromiseRef.current) {
      return loadPromiseRef.current;
    }

    setIsLoading(true);

    const loadPromise = fetchImportModalData({ refresh })
      .then((result) => {
        setData(result);

        if (result.status === "ready") {
          const owners = Array.from(
            new Set(result.repositories.map((repository) => repository.owner)),
          );
          const preferredOwner =
            owners.find(
              (owner) =>
                owner.toLowerCase() === result.viewerLogin.toLowerCase(),
            ) ??
            owners[0] ??
            "";

          setSelectedOwner((currentOwner) =>
            owners.some(
              (owner) =>
                owner.toLowerCase() === currentOwner.toLowerCase(),
            )
              ? currentOwner
              : preferredOwner,
          );
        }
      })
      .catch(() => {
        setData({
          message:
            "Repositories could not be loaded. Check your connection and try again.",
          status: "error",
        });
      })
      .finally(() => {
        loadPromiseRef.current = null;
        setIsLoading(false);
      });

    loadPromiseRef.current = loadPromise;
    return loadPromise;
  }, []);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      void loadData(
        successParam === "github_connected" ||
          successParam === "import_session_ready",
      );
    }

    wasOpenRef.current = isOpen;
  }, [isOpen, loadData, successParam]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (successParam === "import_session_ready") {
      toast.success(
        "Repository access refreshed. You can import any repo marked Ready.",
        { id: "github-import-session-ready" },
      );
    }

    const url = new URL(window.location.href);
    const shouldReplace =
      url.searchParams.has("error") ||
      url.searchParams.has("newImport") ||
      url.searchParams.has("owner") ||
      successParam === "import_session_ready";

    if (shouldReplace) {
      url.searchParams.delete("error");
      url.searchParams.delete("newImport");
      url.searchParams.delete("owner");

      if (successParam === "import_session_ready") {
        url.searchParams.delete("success");
      }

      window.history.replaceState({}, "", url.toString());
    }
  }, [isOpen, successParam]);

  useEffect(() => {
    function refreshAfterGitHubAccess() {
      if (!isOpen || !importAccessOpenedRef.current) {
        return;
      }

      importAccessOpenedRef.current = false;
      void loadData(true);
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        refreshAfterGitHubAccess();
      }
    }

    window.addEventListener("focus", refreshAfterGitHubAccess);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener("focus", refreshAfterGitHubAccess);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isOpen, loadData]);

  const readyData = data?.status === "ready" ? data : null;
  const ownerOptions = useMemo(() => {
    if (!readyData) {
      return [];
    }

    return Array.from(
      new Set(readyData.repositories.map((repository) => repository.owner)),
    ).sort((firstOwner, secondOwner) => {
      if (
        firstOwner.toLowerCase() === readyData.viewerLogin.toLowerCase()
      ) {
        return -1;
      }

      if (
        secondOwner.toLowerCase() === readyData.viewerLogin.toLowerCase()
      ) {
        return 1;
      }

      return firstOwner.localeCompare(secondOwner);
    });
  }, [readyData]);
  const filteredRepositories = useMemo(
    () =>
      readyData?.repositories.filter(
        (repository) =>
          repository.owner.toLowerCase() === selectedOwner.toLowerCase(),
      ) ?? [],
    [readyData, selectedOwner],
  );

  function markGitHubAccessOpened() {
    importAccessOpenedRef.current = true;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="max-w-4xl gap-0 overflow-hidden rounded-none border-border bg-background p-0 sm:max-w-4xl"
        showCloseButton={false}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
          <DialogTitle className="text-sm font-bold uppercase tracking-tight">
            Import Repository
          </DialogTitle>
          <DialogClose asChild>
            <button
              className="text-muted-foreground transition hover:text-foreground"
              type="button"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </DialogClose>
        </div>

        <div className="max-h-[80vh] space-y-6 overflow-y-auto p-6">
          {!data && isLoading ? (
            <LoadingRepositories />
          ) : data?.status === "github_disconnected" ? (
            <ImportState
              action={
                <Button
                  asChild
                  className="h-12 rounded-none px-8 text-[10px] font-bold uppercase tracking-widest"
                >
                  <Link href="/onboarding/github">Connect GitHub</Link>
                </Button>
              }
              description="Connect your GitHub account before importing repositories."
              title="GitHub Not Connected"
            />
          ) : data?.status === "session_required" ? (
            <ImportState
              action={
                <Button
                  asChild
                  className="h-12 rounded-none px-8 text-[10px] font-bold uppercase tracking-widest"
                >
                  <a href="/api/github/import-session/start">
                    Continue with GitHub
                  </a>
                </Button>
              }
              description="Authorize temporary repository access to continue. The session lasts ten minutes."
              title="Repository Access Required"
            />
          ) : data?.status === "error" ? (
            <div className="space-y-4">
              <Alert
                className="rounded-none border-destructive/20 bg-destructive/10"
                variant="destructive"
              >
                <ShieldAlert className="h-4 w-4 text-destructive" />
                <AlertTitle className="text-[10px] font-bold uppercase tracking-widest">
                  Repository Access Error
                </AlertTitle>
                <AlertDescription className="mt-2 text-xs font-medium">
                  {data.message}
                </AlertDescription>
              </Alert>
              <Button
                className="h-10 rounded-none px-6 text-[10px] font-bold uppercase tracking-widest"
                disabled={isLoading}
                onClick={() => void loadData(true)}
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                )}
                Retry
              </Button>
            </div>
          ) : readyData ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  className="h-12 rounded-none bg-primary-foreground px-8 text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary-foreground/90"
                  disabled={isLoading}
                  onClick={() => void loadData(true)}
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  )}
                  {isLoading ? "Refreshing..." : "Refresh Repositories"}
                </Button>
                <Button
                  asChild
                  className="h-12 rounded-none border-border px-8 text-[10px] font-bold uppercase tracking-widest"
                  variant="outline"
                >
                  <a
                    href={githubAppInstallUrl}
                    onClick={markGitHubAccessOpened}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Grant Access
                    <ExternalLink className="ml-2 h-3.5 w-3.5" />
                  </a>
                </Button>
                <ImportGuidePopup />
              </div>

              {readyData.repositories.length === 0 ? (
                <ImportState
                  description="GitHub did not return any repositories for this account."
                  title="No Repositories Available"
                />
              ) : (
                <section className="space-y-6">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      Repositories
                    </p>
                    <RepositoryOwnerFilter
                      onOwnerChange={setSelectedOwner}
                      owners={ownerOptions}
                      selectedOwner={selectedOwner}
                    />
                  </div>

                  <RepositorySearchBar
                    disabled={isLoading || filteredRepositories.length === 0}
                    githubAppInstallUrl={githubAppInstallUrl}
                    importedProjects={readyData.importedProjects}
                    key={selectedOwner}
                    onGrantAccess={markGitHubAccessOpened}
                    repositories={filteredRepositories}
                  />
                </section>
              )}
            </>
          ) : (
            <LoadingRepositories />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LoadingRepositories() {
  return (
    <div className="flex flex-col items-center justify-center border border-dashed border-border bg-muted/10 py-24 text-center">
      <Database className="mb-4 h-8 w-8 animate-pulse text-muted-foreground/30" />
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Loading Repositories...
      </p>
    </div>
  );
}

function ImportState({
  action,
  description,
  title,
}: {
  action?: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center border border-dashed border-border bg-muted/10 py-24 text-center">
      <Database className="mb-4 h-8 w-8 text-muted-foreground/30" />
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      <p className="mb-6 mt-2 max-w-sm text-[10px] uppercase leading-relaxed text-muted-foreground">
        {description}
      </p>
      {action}
    </div>
  );
}
