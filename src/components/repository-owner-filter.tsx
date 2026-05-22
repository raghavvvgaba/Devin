"use client";

import { ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

type RepositoryOwnerFilterProps = {
  owners: string[];
  selectedOwner: string;
};

export function RepositoryOwnerFilter({
  owners,
  selectedOwner,
}: RepositoryOwnerFilterProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateOwner(owner: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("owner", owner);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-2 text-xs font-medium text-muted-foreground">
      <span className="text-[10px] font-bold uppercase tracking-widest">
        Owner
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="h-10 min-w-56 justify-between rounded-none border-border px-3 text-sm font-medium normal-case tracking-normal"
            variant="outline"
          >
            <span className="truncate">{selectedOwner}</span>
            <ChevronDown className="ml-3 h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-none">
          <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest">
            Repository owner
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={updateOwner}
            value={selectedOwner}
          >
            {owners.map((owner) => (
              <DropdownMenuRadioItem
                className="rounded-none"
                key={owner}
                value={owner}
              >
                {owner}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
