"use client";

import { useCallback, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  ExternalLink,
  Globe,
  Monitor,
  RefreshCw,
  LoaderCircle,
} from "lucide-react";
import { toast } from "sonner";

import { IssueSandboxStatusPanel } from "~/components/issue-sandbox-status-panel";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type IssuePreviewPaneProps = {
  checkPreviewAction: string;
  heartbeatAction: string;
  projectId: string;
  restartPreviewAction: string;
  sessionAction: string;
  startAction: string;
  stopAction: string;
};

export function IssuePreviewPane({
  checkPreviewAction,
  heartbeatAction,
  projectId,
  restartPreviewAction,
  sessionAction,
  startAction,
  stopAction,
}: IssuePreviewPaneProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [previewStatusMessage, setPreviewStatusMessage] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  const handlePreviewStateChange = useCallback((state: {
    isPreparing: boolean;
    message: string | null;
    previewUrl: string | null;
  }) => {
    setPreviewUrl(state.previewUrl);
    setIsPreparingPreview(state.isPreparing);
    setPreviewStatusMessage(state.message);
  }, []);

  function handleRefreshPreview() {
    setIframeKey((k) => k + 1);
  }

  async function handleCopyPreviewLink() {
    if (!previewUrl) return;

    try {
      await navigator.clipboard.writeText(previewUrl);
      toast.success("Preview link copied.");
    } catch {
      toast.error("Could not copy preview link.");
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[#f3efe5] text-[#171713] dark:bg-[#201f1a] dark:text-[#fffaf0]">
      {/* Status Panel Header */}
      <header className="relative flex h-14 shrink-0 items-center border-b border-[#171713]/15 bg-[#fffaf0]/75 px-4 after:absolute after:bottom-[-1px] after:left-4 after:h-px after:w-14 after:bg-[#f04f2f] dark:border-white/10 dark:bg-[#171713]">
        <IssueSandboxStatusPanel
          checkPreviewAction={checkPreviewAction}
          heartbeatAction={heartbeatAction}
          onPreviewStateChange={handlePreviewStateChange}
          projectId={projectId}
          restartPreviewAction={restartPreviewAction}
          sessionAction={sessionAction}
          startAction={startAction}
          stopAction={stopAction}
        />
      </header>

      {/* Preview Area */}
      {previewUrl ? (
        <div className="flex flex-1 flex-col min-h-0">
          {/* Browser Chrome */}
          <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-[#171713]/15 bg-[#fffaf0]/75 px-3 dark:border-white/10 dark:bg-[#171713]">
            {/* Navigation buttons */}
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[#8f8b82] hover:bg-[#171713]/5 hover:text-[#171713] dark:text-[#817e75] dark:hover:bg-white/5 dark:hover:text-[#fffaf0]"
                disabled
                type="button"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[#8f8b82] hover:bg-[#171713]/5 hover:text-[#171713] dark:text-[#817e75] dark:hover:bg-white/5 dark:hover:text-[#fffaf0]"
                disabled
                type="button"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[#6d675d] hover:bg-[#f04f2f] hover:text-white dark:text-[#aaa69d]"
                onClick={handleRefreshPreview}
                type="button"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Address bar */}
            <div className="flex min-w-0 flex-1 items-center gap-2 border border-[#171713]/15 bg-[#f3efe5]/70 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.04]">
              <Globe className="h-3 w-3 shrink-0 text-[#f04f2f]" />
              <span className="truncate font-mono text-[11px] text-[#6d675d] select-all dark:text-[#aaa69d]">
                {previewUrl}
              </span>
            </div>

            {/* Copy preview URL */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[#6d675d] hover:bg-[#171713]/5 hover:text-[#171713] dark:text-[#aaa69d] dark:hover:bg-white/5 dark:hover:text-[#fffaf0]"
              onClick={handleCopyPreviewLink}
              type="button"
            >
              <Copy className="h-3.5 w-3.5" />
              <span className="sr-only">Copy preview link</span>
            </Button>

            {/* Open in new tab */}
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[#6d675d] hover:bg-[#171713]/5 hover:text-[#171713] dark:text-[#aaa69d] dark:hover:bg-white/5 dark:hover:text-[#fffaf0]"
            >
              <a href={previewUrl} rel="noreferrer" target="_blank">
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="sr-only">Open in new tab</span>
              </a>
            </Button>
          </div>

          {/* Iframe */}
          <div className="flex-1 min-h-0">
            <iframe
              key={iframeKey}
              src={previewUrl}
              className="h-full w-full border-0"
              title="Sandbox preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              allow="clipboard-read; clipboard-write"
            />
          </div>
        </div>
      ) : isPreparingPreview ? (
        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          <div className="absolute h-64 w-64 rotate-45 border border-[#171713]/[0.07] dark:border-white/[0.06]" />
          <div className="relative flex flex-col items-center gap-4 text-center text-[#6d675d] dark:text-[#aaa69d]">
            <LoaderCircle className="h-7 w-7 animate-spin text-[#f04f2f]" />
            <div>
              <p className="text-sm font-semibold text-[#171713] dark:text-[#fffaf0]">Sandbox is running</p>
              <p className="mt-1 text-xs text-[#777167] dark:text-[#817e75]">
                {previewStatusMessage ?? "Preparing the preview..."}
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Empty state - no preview URL */
        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          <div className="absolute h-72 w-72 rotate-45 border border-[#171713]/[0.07] dark:border-white/[0.06]" />
          <div className="relative flex flex-col items-center gap-4 text-center text-[#6d675d] dark:text-[#aaa69d]">
            <div className={cn(
              "flex h-14 w-14 items-center justify-center",
              "border border-[#f04f2f]/35 bg-[#f04f2f]/10"
            )}>
              <Monitor className="h-5 w-5 text-[#f04f2f]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#171713] dark:text-[#fffaf0]">No preview available</p>
              <p className="mt-1 text-xs text-[#777167] dark:text-[#817e75]">
                Start the sandbox to see a live preview here.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
