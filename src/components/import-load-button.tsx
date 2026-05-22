"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";

type ImportLoadButtonProps = {
  href: string;
  hasSession: boolean;
};

export function ImportLoadButton({ href, hasSession }: ImportLoadButtonProps) {
  const [loading, setLoading] = useState(false);

  function handleClick() {
    setLoading(true);
    window.location.href = href;
  }

  return (
    <Button
      className="bg-primary-foreground text-primary font-bold uppercase text-[10px] tracking-widest h-12 rounded-none px-8 hover:bg-primary-foreground/90"
      disabled={loading}
      onClick={handleClick}
    >
      {loading ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="mr-2 h-3.5 w-3.5" />
      )}
      {loading
        ? hasSession
          ? "Refreshing..."
          : "Starting..."
        : hasSession
          ? "Refresh Repositories"
          : "Load Repositories"}
    </Button>
  );
}
