# Context - GitHub Contribution MVP

## What We're Building

A simple SaaS product for non-technical users like PMs or CEOs to make very small contributions to existing GitHub codebases through a much simpler interface than developer tools.

For this MVP, the goal is not to build a full AI coding agent. The goal is to prove the basic product loop:

- user signs up / logs in
- connects GitHub
- imports an existing repo
- opens that repo as a project
- sees issues fetched from GitHub
- makes a tiny file change
- commits and pushes
- creates a pull request

---

## Core Product Idea

Non-technical users usually cannot work comfortably inside GitHub, code editors, terminals, or diff-heavy developer tools.

This product acts as a simple layer on top of GitHub so they can interact with existing repos in a much more understandable way.

For the MVP:
- no AI-generated code changes
- no real agent sessions
- no issue creation from the app
- no advanced collaboration
- no org/team layer yet

The entire MVP is focused on one simple outcome:

**Append `"hello world"` to a file in a connected repo, then commit, push, and open a PR.**

---

## MVP Scope

### In Scope
- user authentication
- GitHub connection
- importing existing GitHub repositories
- dashboard with imported projects
- project details page
- live issue fetching from GitHub
- a simple fake chat / command input area
- editing a file
- committing and pushing
- creating a PR

### Out of Scope
- AI code generation
- long-running chat sessions
- storing issues in the database
- creating GitHub issues from the app
- multi-user collaboration
- organization workspaces
- advanced repo setup
- broad edge-case handling beyond the happy path

---

## Main Product Flow

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
Fetch issues from GitHub
      ↓
Edit file
      ↓
Commit and push
      ↓
Create PR
```

---

## Product Decisions

### GitHub as source of truth
The app does not create repositories. It only works with existing GitHub repositories.

### Project meaning
For the MVP, a **project** in the app is the same thing as an imported GitHub repository.

### Issues
Issues are fetched live from GitHub when opening a project. They are not stored in the app database.

### GitHub disconnect behavior
If a user disconnects GitHub in the MVP, all imported projects for that user can be deleted.

### Scope discipline
The MVP intentionally ignores complex future requirements. It focuses only on validating the smallest useful workflow.

---

## Tech Stack

| Layer | Choice |
| --- | --- |
| App framework | Next.js |
| Hosting | Vercel |
| Auth | Clerk |
| Database | Neon Postgres |
| ORM | Prisma |
| GitHub integration | GitHub App |

### Why this stack
This stack was chosen for:
- fast MVP development
- low operational overhead
- full-stack TypeScript workflow
- easy deployment
- reliable auth
- secure GitHub access

### Auth decision
Clerk was chosen because it is the easiest and most mature option for quickly shipping the MVP right now.

---

## Data Model

The MVP currently uses only **2 tables**.

### users
Represents a user of the app.

**Fields**
- `id`
- `name`
- `email`
- `github_username` (optional)
- `github_connected`
- `github_connection_reference` (optional)
- `created_at`

**Rules**
- `id` is unique
- `email` is unique
- `github_username` is unique
- one app user has at most one GitHub connection in the MVP

### projects
Represents an imported GitHub repository.

**Fields**
- `id`
- `repo_name`
- `repo_owner`
- `user_id`
- `created_at`

**Rules**
- `id` is unique
- `(user_id, repo_owner, repo_name)` is unique together
- one user can have many projects
- one project belongs to one user

### Data model principle
Only store app-owned data needed to recover state later. Fetch GitHub-owned data live when needed.

---

## Backend API Plan

### `POST /projects`
Import a GitHub repo as a project.

### `GET /projects`
List all projects for the current user.

### `GET /projects/:id`
Get one project’s detail view with GitHub-fetched issues.

### `PUT /projects/:id/edit`
Edit the target file.

### `POST /projects/:id/commit`
Commit and push the change.

### `POST /projects/:id/pull-request`
Create a PR.

### API design principle
- current user comes from auth/session
- project identity comes from route params
- request body contains only minimum action-specific input
- backend creates system-owned fields

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

### Page flow
- Sign up / log in
- Connect GitHub
- Open dashboard
- Click **New**
- Select a repo from GitHub
- Import repo
- Open project page
- View issues
- Edit file
- Commit and push
- Create PR

### Key UI surfaces
#### Dashboard
Shows imported projects and the **New** action.

#### Repo import flow
Lets the user choose an existing GitHub repo and import it.

#### Project page
Contains:
- repo/issues section
- simple fake chat/edit area
- edit action
- commit/push action
- PR action

---

## MVP Behavior

### Happy path
1. User signs in
2. User connects GitHub
3. User imports a repo
4. User opens the project
5. User sees issues
6. User triggers a tiny edit
7. User commits and pushes
8. User creates a PR

### Success condition
A user can sign in, connect GitHub, import one repo, append `"hello world"` to a file, commit/push it, and open a PR.

---

## Constraints and Philosophy

### Keep it minimal
This project is for learning and MVP validation, not for building the final product immediately.

### Avoid premature complexity
No extra tables, no issue persistence, no organization layer, no AI session system, and no advanced abstractions unless the MVP proves itself.

### Focus on one win
The MVP is successful if the full GitHub contribution loop works once, end to end, in a simple interface.

---

## Current Development Direction

The plan is complete enough to start building. The immediate implementation focus is:

1. auth
2. GitHub connect flow
3. project import
4. dashboard
5. project page
6. edit → commit/push → PR flow

Everything else can come later after the MVP works.
