"use client";

import { Check, ClipboardCopy, LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";

type CopyState = "copied" | "copying" | "error" | "idle";

async function writeToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  const didCopy = document.execCommand("copy");
  textArea.remove();

  if (!didCopy) {
    throw new Error("Clipboard access is unavailable.");
  }
}

export function ActivityTraceCopyButton({
  trace,
}: {
  trace: string;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  async function copyTrace() {
    if (copyState === "copying") {
      return;
    }

    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }

    setCopyState("copying");

    try {
      if (!trace.trim()) {
        throw new Error("The exported trace was empty.");
      }

      await writeToClipboard(trace);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    resetTimerRef.current = setTimeout(() => {
      setCopyState("idle");
    }, 2_500);
  }

  const content = {
    copied: {
      icon: Check,
      label: "Trace copied",
    },
    copying: {
      icon: LoaderCircle,
      label: "Copying trace",
    },
    error: {
      icon: TriangleAlert,
      label: "Copy failed",
    },
    idle: {
      icon: ClipboardCopy,
      label: "Copy full trace",
    },
  }[copyState];
  const Icon = content.icon;

  return (
    <Button
      className="h-10 rounded-none border-border bg-card px-3 text-xs font-semibold hover:border-[#f04f2f] hover:bg-[#f04f2f]/10"
      disabled={copyState === "copying"}
      onClick={copyTrace}
      type="button"
      variant="outline"
    >
      <Icon
        className={
          copyState === "copying" ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"
        }
      />
      <span aria-live="polite">{content.label}</span>
    </Button>
  );
}
