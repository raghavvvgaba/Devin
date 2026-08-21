# Tools

Canonical developer-facing contracts for sandbox tools live here.

This file is the current source of truth for tool behavior that the app and future agent layers should rely on.

## Agent Modes

- `plan` is read-only and exposes `glob_files`, `list_directory`, `read_file`, and `search_code`.
- `build` exposes all sandbox agent tools, including `replace_in_file` and `write_file`.
- unavailable tools are omitted from the model request, and write attempts are independently rejected at runtime in Plan mode.
- missing API mode defaults to `plan`; mode selection is not persisted across page loads.

## `glob_files`

Purpose: Find files inside the sandbox repo by path pattern.

Input:
- `sessionId: string`
- `patterns: string[]`
- `path?: string`

Output:
- `paths: string[]`
- `truncated: boolean`
- `cap: 100`

Behavior:
- patterns use ripgrep glob syntax
- leading `!` patterns exclude matching files
- paths are repository-relative and sorted
- respects ignore files and skips generated/dependency directories
- returns at most `100` paths
- `truncated=true` means more matching paths may exist
- caller should narrow the path or patterns and retry

Example patterns:
- `src/**/*.tsx`
- `**/*.{ts,js}`
- `!**/*.test.ts`

## `search_code`

Purpose: Search code inside the sandbox repo.

Input:
- `sessionId: string`
- `query: string`
- `path?: string`
- `include?: string[]`
- `regex?: boolean`

Output:
- `matches: array`
- `truncated: boolean`
- `caps: { total: 10, perFile: 2 }`

Each match includes:
- `path: string`
- `line: number`
- `column: number`
- `text: string`

Limits:
- max `10` matches total
- max `2` matches per file

Behavior:
- literal text search by default
- `regex=true` interprets `query` as a ripgrep regular expression
- `include` limits searched files with ripgrep glob patterns and supports leading `!` exclusions
- returns single-line matches only
- skips hidden files by default
- `truncated=true` means result cap was hit
- more matches may exist
- does not support pagination
- caller should narrow query/path and retry

Examples:
- `{ query: "Full stack developer", include: ["**/*.{jsx,tsx}"] }`
- `{ query: "use(State|Effect)", include: ["src/**/*.tsx", "!**/*.test.tsx"], regex: true }`

## `replace_in_file`

Purpose: Replace one unique exact text match in an inspected file.

Input:
- `sessionId: string`
- `path: string`
- `oldText: string`
- `newText: string`

Output:
- `path: string`
- `startLine: number` — discovered line where the unique match began
- `oldText: string`
- `newText: string`
- `session: SandboxSession`

Behavior:
- reads the current file before writing
- normalizes line endings to `\n`
- `oldText` must match exactly and may span multiple lines
- exactly one occurrence of `oldText` must exist in the current file
- `newText` may span multiple lines
- when no exact match exists, the caller must reread the relevant lines before retrying
- when multiple matches exist, the failure returns up to `5` matching line numbers and asks for more surrounding text
- caller should inspect every line included in `oldText` with `read_file` before editing
- writes the full updated file through the sandbox provider
- use this for targeted single-line or multiline edits instead of full-file `write_file`
