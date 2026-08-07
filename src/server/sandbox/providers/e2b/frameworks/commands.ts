import type { PackageManager } from "../types";

export function getDevScriptCommand(
  packageManager: PackageManager,
  argumentsText: string,
) {
  if (packageManager === "bun") {
    return `export PATH="$HOME/.bun/bin:$PATH"; bun run dev ${argumentsText}`;
  }

  if (packageManager === "pnpm") return `pnpm dev ${argumentsText}`;
  if (packageManager === "yarn") return `yarn dev ${argumentsText}`;
  return `npm run dev -- ${argumentsText}`;
}
