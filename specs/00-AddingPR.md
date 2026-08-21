# Adding Submit-to-PR Flow

## Goal

Add a single submit action in the issue workspace that:

1. Uses the live sandbox repository state.
2. Commits all current changes.
3. Pushes those changes to GitHub on a safe non-default branch.
4. Creates or reuses a pull request.
5. Returns the PR URL to the app.

This is the end of Inlaya's responsibility for this flow. A human engineer can review and merge the PR later.

## Product Intent

The implementation should stay simple, direct, and consistent with the current sandbox-first architecture.

We do not want to:

- reintroduce a generic legacy commit/PR bridge
- expose broad arbitrary git command execution to the user or agent
- over-engineer extra workflow state

## High-Level Flow

1. User clicks `Submit` in the issue workspace.
2. Backend validates:
   - signed-in user
   - owned project
   - active sandbox session for that project
3. Backend fetches a fresh GitHub App installation token for the repo.
4. Backend runs a fixed git flow inside the sandbox:
   - verify there are changes
   - create or switch to the issue branch
   - configure git identity as `Tessera-bot`
   - stage all changes
   - commit with a generated commit message
   - push the branch to `origin`
5. Backend creates or reuses a PR through the GitHub API.
6. Backend returns success data including PR URL and branch name.
7. App shows the PR result in the issue workspace.

## Submit Progress

The submit button should show a loading state while the backend is running.

It should also show a short live status message near the button using the same existing sandbox session polling path that powers sandbox startup status.

Submit progress should be exposed as submit-specific sandbox session fields:

- `submitState`
- `submitStage`
- `submitMessage`

These fields are in-memory session status only. They should not be stored in Prisma.

Expected user-visible steps:

1. Checking for sandbox changes
2. Preparing branch `tessera/issue-<issueNumber>`
3. Staging files
4. Creating commit
5. Pushing branch to GitHub
6. Creating pull request
7. Done or error

Detailed command output can continue to appear in the existing sandbox diagnostics logs.

## Key Decisions

### 1. Keep ownership and session validation

Yes, we need it.

Reason:

- protects against stale `sessionId`s
- prevents cross-project or wrong-session submits
- ensures submit only runs from a live sandbox

This should stay as a small backend guard, not be skipped.

### 2. Use a fresh installation token at submit time

Yes, we should fetch a fresh token for submit.

Reason:

- GitHub App installation tokens expire
- the clone-time token may no longer be valid
- submit should not depend on old credentials still being preserved inside the sandbox

Practical rule:

- clone uses one installation token
- submit fetches a fresh installation token
- push and PR creation use that fresh token

### 3. Branch creation timing

We do not need to create the branch right after cloning.

Decision:

- users can keep editing on the default checked-out branch in the sandbox
- create or switch to the issue branch only at submit time

Reason:

- git allows creating a new branch after local edits as long as it is the same HEAD lineage
- this keeps sandbox startup simpler
- avoids creating branches for abandoned work

### 4. Commit identity

Use `Tessera-bot` for v1 instead of the user's identity.

This avoids adding user email handling right now.

### 5. Branch strategy

Use one branch per issue.

Agreed branch naming format:

- `tessera/issue-123`

### 6. No-op and existing PR handling

Yes, required.

Behavior:

- if there are no file changes, return a clean no-op response
- if a PR already exists for the chosen branch, reuse it instead of failing noisily

## Permissions Required

The GitHub App must have:

- `Contents: write`
- `Pull requests: write`

`Contents: read` alone is not enough for push.

## Recommended Architecture

## Backend

Add a dedicated submit route instead of widening the generic sandbox command allowlist.

Recommended shape:

- `POST /api/projects/[id]/issues/[issueNumber]/sandbox/submit`

Why:

- keeps the current sandbox command model tight
- avoids exposing raw `git add`, `git commit`, and `git push` as general-purpose commands
- matches the existing issue-scoped sandbox route pattern

## Sandbox execution

Use a fixed backend-controlled sequence, not freeform command input.

Likely steps inside the sandbox:

1. `git status --short`
2. `git switch -c tessera/issue-<issueNumber>` or switch to it if it already exists
3. configure repo-local git user name/email for `Tessera-bot`
4. `git add .`
5. `git commit -m "<message>"`
6. push branch to `origin`

## GitHub API

After push, create or reuse the PR through GitHub API using the same fresh installation token.

PR target:

- `head`: `tessera/issue-<issueNumber>`
- `base`: default repo branch

## UI Placement

Add the submit button in the issue workspace flow, near the existing sandbox actions.

The button should:

- only be useful when the sandbox is active
- show loading state while submit is running
- show the current submit step near the button while submit is running
- return the PR URL on success
- show a clean error on failure

## Commit / PR Text

Still intentionally simple for v1.

Current direction:

- branch: `tessera/issue-<issueNumber>`
- commit author: `Tessera-bot`
- commit message: generated from the issue
- PR title: generated from the issue

We already agreed not to add extra complexity here yet.

## What We Are Not Doing In V1

- branching at sandbox startup
- storing durable PR workflow state in Prisma
- exposing arbitrary write-capable git commands to the agent
- using the end user's git email identity
- handling merge/review logic inside Inlaya

## Summary

The simplest safe version is:

- edit normally in the sandbox
- click submit
- fetch fresh installation token
- create/switch to `tessera/issue-<issueNumber>`
- commit as `Tessera-bot`
- push
- create or reuse PR
- return PR URL

That is the agreed v1 direction.
