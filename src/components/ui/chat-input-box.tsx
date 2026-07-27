"use client";

import { useEffect, useRef } from "react";
import {
  ArrowUp,
  CheckIcon,
  ChevronDown,
  Hammer,
  ListTree,
  LoaderCircle,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import { AGENT_MODELS, getAgentModelLabel } from "~/lib/agent-models";
import type { SandboxAgentMode } from "~/server/sandbox/types";

type ChatInputBoxProps = {
  accessBlocked?: boolean;
  instruction: string;
  isPreparing?: boolean;
  mode: SandboxAgentMode;
  modelPickerEnabled?: boolean;
  onInstructionChange: (value: string) => void;
  onModeChange: (mode: SandboxAgentMode) => void;
  onModelChange: (model: string) => void;
  onPrepareEdit: () => void;
  selectedModel: string;
};

export function ChatInputBox({
  accessBlocked = false,
  instruction,
  isPreparing = false,
  mode,
  modelPickerEnabled = false,
  onInstructionChange,
  onModeChange,
  onModelChange,
  onPrepareEdit,
  selectedModel,
}: ChatInputBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, []);

  return (
    <div className="flex w-full flex-col border border-[#171713]/15 bg-[#f3efe5]/55 p-3 shadow-[5px_5px_0_rgba(23,23,19,0.05)] dark:border-[#fffaf0]/15 dark:bg-white/[0.035] dark:shadow-[5px_5px_0_rgba(240,79,47,0.08)]">
      <textarea
        ref={textareaRef}
        className="min-h-[44px] w-full resize-none bg-transparent text-xs leading-5 text-foreground outline-none transition-opacity duration-200 placeholder:text-[#777167] disabled:cursor-not-allowed disabled:opacity-50 dark:placeholder:text-[#8f8b82]"
        disabled={accessBlocked || isPreparing}
        onChange={(event) => {
          onInstructionChange(event.target.value);
        }}
        onInput={(event) => {
          const textarea = event.currentTarget;
          textarea.style.height = "0px";
          textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onPrepareEdit();
          }
        }}
        placeholder={
          mode === "plan"
            ? "Ask about the project or plan a change."
            : "Describe what you want Devin to change."
        }
        value={instruction}
        required
      />

      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            aria-label="Agent mode"
            className="flex h-7 items-center border border-[#171713]/15 bg-[#e8e2d5]/70 p-0.5 dark:border-[#fffaf0]/15 dark:bg-white/5"
            role="group"
          >
            {(["plan", "build"] as const).map((agentMode) => {
              const selected = mode === agentMode;
              const Icon = agentMode === "plan" ? ListTree : Hammer;

              return (
                <button
                  key={agentMode}
                  aria-pressed={selected}
                  className={cn(
                    "flex h-6 items-center gap-1 px-2 text-[10px] font-semibold capitalize text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f04f2f]",
                    selected && "bg-[#fffaf0] text-[#171713] shadow-sm dark:bg-[#f3efe5]",
                  )}
                  disabled={accessBlocked || isPreparing}
                  onClick={() => onModeChange(agentMode)}
                  type="button"
                >
                  <Icon className="size-3" />
                  {agentMode}
                </button>
              );
            })}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Select model"
                className={cn(
                  "flex h-7 items-center gap-1 border border-[#171713]/15 bg-[#e8e2d5]/70 px-2 text-[10px] font-semibold text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f04f2f] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#fffaf0]/15 dark:bg-white/5",
                )}
                disabled={!modelPickerEnabled || accessBlocked || isPreparing}
                title={
                  modelPickerEnabled
                    ? "Select AI model"
                    : "Model picker is unavailable with the current AI provider."
                }
                type="button"
              >
                {getAgentModelLabel(selectedModel)}
                <ChevronDown className="size-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="top"
              sideOffset={4}
              className="min-w-44 rounded-none border-border"
            >
              {AGENT_MODELS.map((model) => {
                const active = model.id === selectedModel;
                return (
                  <DropdownMenuItem
                    key={model.id}
                    className="rounded-none text-xs"
                    onClick={() => {
                      onModelChange(model.id);
                    }}
                  >
                    <CheckIcon
                      className={cn(
                        "size-3.5",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {model.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Button
          className="ml-auto h-7 rounded-none bg-[#171713] px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#fffaf0] hover:bg-[#f04f2f] dark:bg-[#fffaf0] dark:text-[#171713] dark:hover:bg-[#f04f2f] dark:hover:text-white"
          disabled={accessBlocked || isPreparing || !instruction.trim()}
          onClick={onPrepareEdit}
          type="button"
        >
          {isPreparing ? (
            <LoaderCircle className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <ArrowUp className="mr-1 h-3 w-3" />
          )}
          {isPreparing ? "Working" : "Run Agent"}
        </Button>
      </div>
    </div>
  );
}
