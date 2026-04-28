# Devin - Project Context

## What We're Building

Devin is a simple SaaS product for non-technical users like PMs or CEOs to make small, reviewable contributions to existing GitHub codebases without living inside GitHub, code editors, terminals, or diff-heavy developer tools.

The product goal is to make the GitHub contribution loop understandable:

- sign in
- connect GitHub
- import an existing repository
- open a GitHub issue
- ask the AI to prepare a small file edit
- review the prepared change
- create a branch and commit
- open a pull request

This is still an MVP. The current focus is not a full autonomous coding agent. The focus is a narrow issue workspace that can prepare and ship small GitHub changes safely.

---

## Current Product Flow

```text
Sign up / Log in
      ↓
Connect GitHub
      ↓
Dashboard
      ↓
Import existing repo as project
      ↓
Open project
      ↓
Fetch issues live from GitHub
      ↓
Open issue workspace
      ↓
Chat with AI to prepare a small file edit
      ↓
Preview changes
      ↓
Create branch + commit
      ↓
Create pull request
```

---

## Product Principles

### GitHub Is The Source Of Truth

The app does not create repositories. It works with existing GitHub repositories through a GitHub App.

Repos, issues, files, commits, branches, and pull requests belong to GitHub. The app fetches GitHub-owned data when needed instead of duplicating it in the database.

### Project Meaning

For this app, a project is an imported GitHub repository owned by one app user.

### Issue Workspace

The issue workspace is the main contribution surface. It combines:

- live issue details from GitHub
- a chat-style instruction interface
- AI edit preparation
- temporary pending-edit state
- branch + commit action
- pull request action

### Persistence Boundary

The app stores durable app-owned data only:

- users
- imported projects
- issue chat sessions
- issue chat messages

It does not currently store GitHub issues, file diffs, pending edits, commit state, PR state, or sandbox state as durable database records.

---

## Current Architecture

```text
Browser / Next.js App Router UI
              |
              v
Next.js route handlers + server components
              |
      +-------+--------+
      |                |
      v                v
GitHub App API   Neon Postgres via Prisma
      |
      v
GitHub repos, issues, files, commits, PRs
```

### Responsibilities

- Next.js App Router owns UI, server-rendered pages, and route handlers.
- Clerk owns authentication.
- GitHub App integration owns repository access.
- Prisma/Postgres stores app-owned state.
- GitHub remains the source of truth for repo content and issue data.
- Cookie-backed encrypted session data currently stores temporary workflow state.

### Temporary Workflow State

The current implementation still uses encrypted cookies for short-lived workflow state:

- pending edit
- post-commit result
- pull request result

This is intentionally not modeled as durable database state yet. It may be replaced later when the E2B sandbox workflow is designed.

---

## Tech Stack

| Layer | Choice |
| --- | --- |
| App framework | Next.js App Router |
| Hosting | Vercel |
| Auth | Clerk |
| Database | Neon Postgres |
| ORM | Prisma |
| GitHub integration | GitHub App |
| AI edit generation | OpenRouter |

### Why This Stack

This stack was chosen for:

- fast MVP development
- low operational overhead
- full-stack TypeScript workflow
- easy deployment
- reliable auth
- secure GitHub access

---

## Data Model

The current Prisma schema has four app-owned models.

### User

Represents a user of the app.

**Fields**

- `id`
- `name`
- `email`
- `githubUsername`
- `githubConnected`
- `githubConnectionReference`
- `createdAt`

**Rules**

- `id` is the primary key.
- `email` is unique.
- `githubUsername` is unique when present.
- one user can have many projects.
- one user can have many chat sessions.

### Project

Represents an imported GitHub repository.

**Fields**

- `id`
- `repoName`
- `repoOwner`
- `userId`
- `createdAt`

**Rules**

- `id` is the primary key.
- `(userId, repoOwner, repoName)` is unique.
- one project belongs to one user.
- one project can have many chat sessions.

### ChatSession

Represents one default chat session for one GitHub issue inside one project.

**Fields**

- `id`
- `projectId`
- `userId`
- `issueNumber`
- `title`
- `status`
- `createdAt`
- `updatedAt`

**Rules**

- `id` is the primary key.
- `(projectId, issueNumber)` is unique.
- this enforces one default chat session per issue per project.
- `userId` is indexed.
- deleting a project or user cascades to its chat sessions.

### ChatMessage

Represents a persisted chat message inside a chat session.

**Fields**

- `id`
- `sessionId`
- `role`
- `body`
- `tone`
- `createdAt`

**Rules**

- `id` is the primary key.
- `sessionId` points to `ChatSession`.
- messages are ordered by `createdAt`.
- `role` is currently `"user"`, `"assistant"`, or `"system"`.
- `tone` is optional and used for UI rendering such as success, warning, or error.
- thinking/loading messages are not persisted.
- diffs and preview data are not persisted.

### Data Model Principle

Store only app-owned data needed to recover state later. Fetch GitHub-owned data live when needed. Keep future sandbox/workflow state separate from chat persistence.

---

## Current Routes And Workflows

### Project Routes

- `POST /projects`
  - imports a GitHub repository as a project.

- `GET /projects`
  - lists the current user's imported projects.

- `GET /projects/:id`
  - shows a project page with live GitHub issues.

### Issue Workspace Routes

- `GET /projects/:id/issues/:issueNumber`
  - shows the issue workspace.
  - fetches issue details live from GitHub.
  - gets or creates the default chat session.
  - loads persisted chat messages.
  - reads temporary pending edit / commit / PR cookie state.

- `POST /projects/:id/issues/:issueNumber/edit`
  - prepares a small AI-generated file edit for the issue.
  - persists the user and assistant chat messages.
  - writes the temporary pending edit cookie only after chat persistence succeeds.

- `POST /projects/:id/issues/:issueNumber/edit/cancel`
  - clears the temporary pending edit cookie.
  - does not delete persisted chat messages.

- `POST /projects/:id/issues/:issueNumber/commit`
  - creates or reuses the issue branch.
  - commits the prepared file edit to GitHub.
  - clears the pending edit after successful commit.
  - writes temporary post-commit cookie state.

- `POST /projects/:id/issues/:issueNumber/pull-request`
  - creates or reuses the pull request for the issue branch.
  - writes temporary PR cookie state.

### API Design Principle

- current user comes from auth/session.
- project identity comes from route params.
- issue identity comes from route params.
- request body contains only minimum action-specific input.
- server creates system-owned fields.
- validate ownership before GitHub or database operations.

---

## Frontend Structure

### Routes

- `/`
- `/sign-in`
- `/sign-up`
- `/onboarding/github`
- `/dashboard`
- `/projects/new`
- `/projects/:id`
- `/projects/:id/issues/:issueNumber`

### Key UI Surfaces

#### Dashboard

Shows imported projects and the action to import another repository.

#### Repo Import Flow

Lets the user choose an existing GitHub repo and import it.

#### Project Page

Shows project-level GitHub issue data fetched live from GitHub.

#### Issue Workspace

Contains:

- issue title and details
- persisted chat messages
- file path input
- instruction composer
- prepare edit action
- clear draft action
- branch + commit action
- pull request action
- dev-only preview changes modal

#### Dev-Only Preview Changes

The preview modal exists only in development. It renders a unified diff from the cookie-backed pending edit data so changes can be inspected during development without keeping diff UI in the normal chat flow.

---

## Current AI Edit Behavior

The current AI path is intentionally narrow:

- single-file edit preparation
- model configured through server environment
- AI returns a summary and full updated content
- server validates that a change was produced
- user manually commits and opens the PR

This is not yet a broad repo agent. It is a staged prepare -> review -> commit -> PR workflow.

---

## Future Direction: E2B Sandbox Editing

The intended future direction is to edit and preview code inside an E2B sandbox rather than directly modeling the current single-file prepare flow as durable workflow state.

When that phase begins, sandbox concepts should be modeled separately from chat:

- sandbox session
- workspace state
- preview URL
- agent run state
- validation/build status
- file-change state

Do not add durable DB tables for sandbox or workflow state until that architecture is designed. Current chat persistence should remain independent from future sandbox state.

---

## Constraints And Guardrails

### Keep It Minimal

This project is for learning and MVP validation. Avoid building a full platform before the core issue contribution loop is reliable.

### Avoid Premature Workflow Modeling

Do not persist pending edits, commit state, PR state, diff data, or E2B sandbox state as durable DB records yet.

### Preserve Review Before Commit

AI may prepare a change, but the user should stay in control of the commit and PR steps.

### Keep GitHub Data Live

Do not store GitHub issues in the database right now. Fetch issue details from GitHub when opening the project or issue workspace.

---

## Original MVP Intent

The original MVP was even smaller: append `"hello world"` to a selected file, commit it, push it, and open a PR.

That origin still matters because it explains the scope discipline. The product has since evolved to include AI edit preparation, persisted issue chat messages, and a dev-only diff preview, but the same principle remains: prove the smallest useful GitHub contribution loop before adding a full coding-agent system.
