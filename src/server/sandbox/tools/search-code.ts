import "server-only";

/** Implements the app-owned search_code sandbox tool. */

import { PROJECT_DIR } from "~/server/sandbox/providers/e2b/constants";
import { sandboxProvider } from "~/server/sandbox/provider";
import {
  normalizeSandboxRelativePath,
  toSandboxRepoPath,
} from "~/server/sandbox/tools/paths";
import type {
  SandboxSearchInput,
  SandboxSearchMatch,
  SandboxSearchResult,
} from "~/server/sandbox/types";

export const SANDBOX_SEARCH_TOTAL_CAP = 10;
export const SANDBOX_SEARCH_PER_FILE_CAP = 2;

type RipgrepJsonLine = {
  type?: string;
  data?: {
    line_number?: number;
    path?: RipgrepTextValue;
    lines?: RipgrepTextValue;
    submatches?: Array<{
      start?: number;
    }>;
  };
};

type RipgrepTextValue = {
  bytes?: string;
  text?: string;
};

function quoteForShell(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function readRipgrepTextValue(value: RipgrepTextValue | undefined) {
  if (!value) {
    return "";
  }

  if (typeof value.text === "string") {
    return value.text;
  }

  if (typeof value.bytes === "string") {
    return Buffer.from(value.bytes, "base64").toString("utf8");
  }

  return "";
}

function toRelativeSandboxPath(path: string) {
  if (path === PROJECT_DIR) {
    return "";
  }

  return path.startsWith(`${PROJECT_DIR}/`)
    ? path.slice(PROJECT_DIR.length + 1)
    : path;
}

function buildSearchCommand(input: SandboxSearchInput) {
  const normalizedPath = normalizeSandboxRelativePath(input.path, {
    allowRoot: true,
  });
  const repoPath = toSandboxRepoPath(normalizedPath);

  return [
    "rg",
    "--json",
    "--line-number",
    "--column",
    "--fixed-strings",
    "--smart-case",
    `--max-count ${SANDBOX_SEARCH_PER_FILE_CAP}`,
    "-g '!**/.git/**'",
    "-g '!**/.next/**'",
    "-g '!**/.turbo/**'",
    "-g '!**/coverage/**'",
    "-g '!**/dist/**'",
    "-g '!**/node_modules/**'",
    `-e ${quoteForShell(input.query)}`,
    `-- ${quoteForShell(repoPath)}`,
  ].join(" ");
}

function parseSearchMatches(stdout: string) {
  const matches: SandboxSearchMatch[] = [];
  const perFileCounts = new Map<string, number>();

  for (const line of stdout.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    const event = JSON.parse(line) as RipgrepJsonLine;

    if (event.type !== "match" || !event.data) {
      continue;
    }

    const path = toRelativeSandboxPath(readRipgrepTextValue(event.data.path));
    const text = readRipgrepTextValue(event.data.lines).replace(/\r?\n$/, "");
    const lineNumber = event.data.line_number ?? 0;
    const column = (event.data.submatches?.[0]?.start ?? 0) + 1;

    matches.push({
      column,
      line: lineNumber,
      path,
      text,
    });
    perFileCounts.set(path, (perFileCounts.get(path) ?? 0) + 1);

    if (matches.length >= SANDBOX_SEARCH_TOTAL_CAP) {
      break;
    }
  }

  const truncated =
    matches.length >= SANDBOX_SEARCH_TOTAL_CAP ||
    Array.from(perFileCounts.values()).some(
      (count) => count >= SANDBOX_SEARCH_PER_FILE_CAP,
    );

  return {
    matches,
    truncated,
  };
}

/** Runs ripgrep in the sandbox repo and returns capped single-line matches. */
export async function searchSandboxCode(
  input: SandboxSearchInput,
): Promise<SandboxSearchResult> {
  const query = input.query.trim();

  if (!query) {
    throw new Error("missing_query");
  }

  const result = await sandboxProvider.runRawCommand({
    command: buildSearchCommand({
      ...input,
      path: input.path ?? "",
      query,
    }),
    sessionId: input.sessionId,
  });

  if (result.exitCode && ![0, 1].includes(result.exitCode)) {
    throw new Error(result.stderr.trim() || "search_failed");
  }

  const parsed = parseSearchMatches(result.stdout);

  return {
    caps: {
      perFile: SANDBOX_SEARCH_PER_FILE_CAP,
      total: SANDBOX_SEARCH_TOTAL_CAP,
    },
    matches: parsed.matches,
    truncated: result.exitCode === 1 ? false : parsed.truncated,
  };
}
