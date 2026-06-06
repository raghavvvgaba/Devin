# Architecture

This file explains the high-level structure of the app. 

## Product Shape

Devin is a repository-to-issue workflow app:

1. A user signs in.
2. The user connects GitHub.
3. The user imports a repository as a project.
4. The app loads that repository's issues.
5. The user starts a project sandbox.
6. The user opens an issue workspace and reuses that same sandbox for edits and inspection.

## Frontend Structure

Frontend screens live under [src/app](../src/app), especially:

- [src/app/(auth)](../src/app/%28auth%29)
  Auth screens.
- [src/app/(app)](../src/app/%28app%29)
  Signed-in product screens.

Important screens:

- [src/app/(app)/dashboard/page.tsx](../src/app/%28app%29/dashboard/page.tsx)
  Main signed-in dashboard.
- [src/app/(app)/projects/new/page.tsx](../src/app/%28app%29/projects/new/page.tsx)
  Repository import flow.
- [src/app/(app)/projects/[id]/page.tsx](../src/app/%28app%29/projects/%5Bid%5D/page.tsx)
  Project view with issue list and sandbox panel.
- [src/app/(app)/projects/[id]/issues/[issueNumber]/page.tsx](../src/app/%28app%29/projects/%5Bid%5D/issues/%5BissueNumber%5D/page.tsx)
  Issue workspace with shared sandbox and persistent issue chat.

Reusable UI lives under [src/components](../src/components).

## API Structure

Backend HTTP handlers live under [src/app/api](../src/app/api).

Main route groups:

- [src/app/api/github](../src/app/api/github)
  GitHub connect, callback, disconnect, and import-session routes.
- [src/app/api/projects/route.ts](../src/app/api/projects/route.ts)
  Project listing and import creation.
- [src/app/api/projects/[id]/sandbox](../src/app/api/projects/%5Bid%5D/sandbox)
  Project-level sandbox lifecycle routes.
- [src/app/api/projects/[id]/issues/[issueNumber]/sandbox](../src/app/api/projects/%5Bid%5D/issues/%5BissueNumber%5D/sandbox)
  Issue workspace routes for edit, diff, files, commands, and the issue-shaped sandbox lifecycle endpoints.

Even though issue sandbox routes still exist, they now reuse the same project sandbox session.

## Server Modules

Important backend modules:

- [src/server/github](../src/server/github)
  GitHub auth, import, issue fetching, and connection helpers.
- [src/server/sandbox](../src/server/sandbox)
  Sandbox provider contract, route helpers, registry logic, access checks, and AI edit integration.
- [src/server/chat.ts](../src/server/chat.ts)
  Persistent issue chat sessions and messages.
- [src/server/ai](../src/server/ai)
  AI provider abstraction and single-file edit generation.

## Sandbox Architecture

The sandbox layer has two levels of state:

### 1. Durable session registry

Stored in Prisma through the `SandboxSession` model and managed by [src/server/sandbox/session-registry.ts](../src/server/sandbox/session-registry.ts).

This layer stores:

- app `sessionId`
- E2B `sandboxId`
- `projectId`
- `userId`
- `previewUrl`
- `startedAt`
- `lastHeartbeatAt`
- `isStopped`

Purpose:

- survive server restarts
- validate sandbox ownership
- restore a sandbox when the in-memory session object is gone

### 2. Live in-memory E2B session

Managed under [src/server/sandbox/providers/e2b](../src/server/sandbox/providers/e2b).

Purpose:

- hold the currently connected E2B sandbox object
- track logs and preview state while the server process is alive
- provide fast access during active use

If the live in-memory session disappears, the app can restore from the durable Prisma row using `sandboxId`.

## Chat Persistence

Issue chat persistence uses:

- `ChatSession`
- `ChatMessage`

The issue page loads saved messages on render, and the workspace uses them as the initial transcript. Runtime status/error copy is centralized in [src/lib/issue-chat-messages.ts](../src/lib/issue-chat-messages.ts).

## Documentation Boundaries

Use the docs like this:

- [README.md](../README.md)
  Quick start, setup, commands, and repo overview.
- [docs/database.md](database.md)
  Prisma model explanations.
- [docs/architecture.md](architecture.md)
  Frontend/API/sandbox system overview.
