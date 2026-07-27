"use client";

import { useFormStatus } from "react-dom";
import { AlertTriangle, LoaderCircle, Unlink } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

type GithubDisconnectDialogProps = {
  githubUsername: string;
  projectCount: number;
};

function DisconnectSubmitButton({
  projectCount,
  projectLabel,
}: {
  projectCount: number;
  projectLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      aria-disabled={pending}
      className="w-full rounded-none"
      disabled={pending}
      type="submit"
      variant="destructive"
    >
      {pending ? (
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Unlink className="mr-2 h-4 w-4" />
      )}
      {pending
        ? "Disconnecting…"
        : `Disconnect and delete ${projectCount} ${projectLabel}`}
    </Button>
  );
}

export function GithubDisconnectDialog({
  githubUsername,
  projectCount,
}: GithubDisconnectDialogProps) {
  const projectLabel = projectCount === 1 ? "project" : "projects";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          className="h-7 rounded-none border-destructive/30 px-2.5 text-[10px] font-bold uppercase tracking-widest text-destructive hover:bg-destructive/10"
          type="button"
          variant="outline"
        >
          <Unlink className="mr-1.5 h-3 w-3" />
          Disconnect
        </Button>
      </DialogTrigger>

      <DialogContent
        className="rounded-none border-destructive/30 sm:max-w-lg"
        showCloseButton={false}
      >
        <DialogHeader>
          <div className="mb-3 flex h-10 w-10 items-center justify-center border border-destructive/30 bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle className="text-lg font-bold uppercase tracking-tight">
            Disconnect GitHub?
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            This will disconnect @{githubUsername} and permanently delete all{" "}
            {projectCount} imported {projectLabel}, including their saved issue
            chats and sandbox records. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <DialogClose asChild>
            <Button className="rounded-none" type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <form
            action="/api/github/disconnect?returnTo=/projects"
            className="w-full sm:w-auto"
            method="post"
          >
            <DisconnectSubmitButton
              projectCount={projectCount}
              projectLabel={projectLabel}
            />
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
