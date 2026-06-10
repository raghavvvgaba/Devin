# Tools

Canonical developer-facing contracts for sandbox tools live here.

This file is the current source of truth for tool behavior that the app and future agent layers should rely on.

## `search_code`

Purpose: Search code inside the sandbox repo.

Input:
- `sessionId: string`
- `query: string`
- `path?: string`

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
- literal text search only in v1
- returns single-line matches only
- skips hidden files by default
- `truncated=true` means result cap was hit
- more matches may exist
- v1 does not support pagination
- caller should narrow query/path and retry
