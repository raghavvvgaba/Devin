"use client";

import { HelpCircle } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

export function ImportGuidePopup() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-8 w-8 rounded-full border-border p-0"
          size="icon"
          variant="outline"
        >
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 rounded-none p-5"
        sideOffset={8}
      >
        <div className="space-y-5">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Import Guide
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-foreground/80">
              Repositories marked Ready can be imported. If a repository is
              locked, grant the GitHub App access and refresh the list.
            </p>
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              What shows up here
            </h3>
            <ul className="mt-2 space-y-1.5">
              {[
                "Your account repositories are shown by default.",
                "Use the owner dropdown to view organization repositories.",
                "Locked repositories need GitHub App access before import.",
              ].map((item) => (
                <li
                  className="text-xs leading-relaxed text-foreground/80 flex gap-2"
                  key={item}
                >
                  <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Next step
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-foreground/80">
              Choose a repository marked Ready, or grant access to a locked one.
            </p>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
