"use client";

import { useEffect } from "react";
import { toast } from "sonner";

type GithubConnectionToastProps = {
  didConnect: boolean;
};

export function GithubConnectionToast({
  didConnect,
}: GithubConnectionToastProps) {
  useEffect(() => {
    if (!didConnect) return;

    toast.success("GitHub connected successfully.", {
      id: "github-connected",
    });

    const url = new URL(window.location.href);
    url.searchParams.delete("success");
    window.history.replaceState({}, "", url.toString());
  }, [didConnect]);

  return null;
}
