"use client";

import React, { createContext, useContext, useState } from "react";
import { PanelLeftOpen } from "lucide-react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type SidebarContextType = {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
};

const SidebarContext = createContext<SidebarContextType>({
  isOpen: true,
  setIsOpen: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function IssueWorkspaceLayout({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <SidebarContext.Provider value={{ isOpen, setIsOpen }}>
      <div className="inlaya-workspace flex h-screen w-full overflow-hidden bg-background text-sm text-foreground selection:bg-[#f04f2f] selection:text-white">
        {/* Left Pane */}
        <div
          className={cn(
            "flex shrink-0 flex-col overflow-hidden border-r border-[#171713]/20 bg-[#fffaf0]/80 shadow-[8px_0_32px_rgba(23,23,19,0.06)] backdrop-blur-sm transition-[width,opacity,border-color] duration-300 ease-in-out motion-reduce:transition-none dark:border-[#fffaf0]/15 dark:bg-[#11110f]/90 dark:shadow-[8px_0_40px_rgba(0,0,0,0.28)]",
            isOpen
              ? "w-[400px] opacity-100"
              : "pointer-events-none w-0 border-transparent opacity-0",
          )}
        >
          <div className="flex h-full w-[400px] flex-col">
            {sidebar}
          </div>
        </div>

        {/* Right Pane */}
        <div className="relative flex min-w-0 flex-1 flex-col bg-[#f3efe5] dark:bg-[#201f1a]">
          {!isOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-[72px] z-10 h-8 w-8 shrink-0 rounded-none border border-[#171713]/15 bg-[#fffaf0]/90 text-[#6d675d] shadow-lg backdrop-blur hover:bg-[#f04f2f] hover:text-white dark:border-white/15 dark:bg-[#171713]/90 dark:text-[#aaa69d]"
              onClick={() => setIsOpen(true)}
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </Button>
          )}
          {children}
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
