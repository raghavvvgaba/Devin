import { Template } from "e2b";

const BUN_VERSION = "1.3.3";
const PNPM_FALLBACK_VERSION = "9.15.9";

export const template = Template()
  .fromNodeImage("22-slim")
  .aptInstall([
    "build-essential",
    "curl",
    "git",
    "python3",
    "ripgrep",
    "unzip",
  ])
  .runCmd("corepack enable pnpm", { user: "root" })
  .runCmd(`corepack prepare pnpm@${PNPM_FALLBACK_VERSION} --activate`)
  .runCmd(
    `curl -fsSL https://bun.com/install | bash -s "bun-v${BUN_VERSION}"`,
  )
  .runCmd("ln -sf /home/user/.bun/bin/bun /usr/local/bin/bun", {
    user: "root",
  })
  .runCmd([
    "node --version",
    "pnpm --version",
    "bun --version",
    "python3 --version",
    "rg --version",
  ]);
