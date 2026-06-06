# Database

This project uses Prisma with PostgreSQL. The authoritative schema lives in [prisma/schema.prisma](../prisma/schema.prisma). This file explains the intent behind the current models.

## Source Of Truth

- Model definitions: [prisma/schema.prisma](../prisma/schema.prisma)
- Migration history: [prisma/migrations](../prisma/migrations)
- Prisma client setup: [src/server/db.ts](../src/server/db.ts)

## Current Models

### `User`

Represents an authenticated app user.

Important fields:

- `id`
  Primary key. Comes from the auth system.
- `email`
  Unique user email.
- `githubUsername`
  Optional connected GitHub username.
- `githubConnected`
  Whether GitHub has been connected for the user.

Relations:

- `projects`
  Repositories imported by this user.
- `chatSessions`
  Issue chat sessions owned by this user.
- `sandboxSessions`
  Project sandbox sessions owned by this user.

### `Project`

Represents one imported GitHub repository for one user.

Important fields:

- `id`
  App-level project id.
- `repoOwner`
  GitHub repository owner.
- `repoName`
  GitHub repository name.
- `userId`
  Owner of the imported project.

Constraint:

- `@@unique([userId, repoOwner, repoName])`
  Prevents the same user from importing the same repository more than once.

Relations:

- `chatSessions`
  Persistent issue chat sessions for this project.
- `sandboxSessions`
  Sandbox registry rows for this project.

### `ChatSession`

Represents the persistent chat thread for one project issue.

Important fields:

- `projectId`
  The project this issue chat belongs to.
- `issueNumber`
  GitHub issue number for the thread.
- `status`
  Current logical status of the chat session.

Constraint:

- `@@unique([projectId, issueNumber])`
  One stored chat session per project issue.

Why it exists:

- The issue workspace needs persistent history when the user refreshes or comes back later.

### `ChatMessage`

Represents one stored message inside a `ChatSession`.

Important fields:

- `sessionId`
  Parent chat session.
- `role`
  Message role such as user, assistant, or system.
- `body`
  Stored message text.
- `tone`
  Optional metadata for UI rendering.

Index:

- `@@index([sessionId, createdAt])`
  Helps fetch a session's messages in creation order.

Why it exists:

- The issue workspace needs durable transcript storage, not just client-side state.

### `SandboxSession`

Represents the durable registry row for one project sandbox.

Important fields:

- `sessionId`
  App-level sandbox session id used by routes and UI.
- `sandboxId`
  E2B sandbox id used for reconnecting after memory loss.
- `projectId`
  The project that owns the sandbox.
- `userId`
  The user that owns the sandbox.
- `previewUrl`
  Current preview URL for the sandbox app.
- `lastHeartbeatAt`
  Last time the session was touched.
- `startedAt`
  Real sandbox start time.
- `isStopped`
  Lightweight stop marker instead of a full lifecycle enum.

Constraint:

- `projectId @unique`
  The app currently allows one sandbox row per project.

Why it exists:

- Sandbox ownership should survive server restarts.
- The app should be able to restore a live E2B sandbox from persisted metadata.
- Issue pages and project pages now share the same project sandbox.

## Design Notes

### Why the schema file is the source of truth

`schema.prisma` is where Prisma models are defined and mapped to database tables. The app and generated Prisma client both depend on it, so model changes should start there.

### Why this file exists too

The schema file is authoritative, but it is not the best place to explain product intent, tradeoffs, or higher-level relationships in prose. This document exists for that.

### Where to document future model decisions

- Put actual model changes in [prisma/schema.prisma](../prisma/schema.prisma)
- Put migration history in [prisma/migrations](../prisma/migrations)
- Put explanation and reasoning in this file
