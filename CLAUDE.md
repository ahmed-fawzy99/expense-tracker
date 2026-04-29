<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

# Expense Tracker — Agent Orientation

This is an internal expense tracker. Employees submit expenses with receipts, a manager (their assigned approver) approves or rejects, and the chain can grow if a manager wants a second opinion (backend supports this — v1 UI exposes only single-step approve/reject).

## Stack

| Layer    | Tech                                                    |
| -------- | ------------------------------------------------------- |
| Backend  | Convex (DB, server functions, file storage, live queries) |
| Auth     | `@convex-dev/auth` Password provider                    |
| Frontend | React 19 + Vite + TanStack Router (file-based)          |
| UI       | Tailwind v4 + shadcn (purple theme per `docs/design/DESIGN.md`) |
| Tables   | TanStack Table                                          |
| Forms    | react-hook-form + zod v4                                |
| Tests    | Vitest + `convex-test` (backend only in v1)             |
| Pkg mgr  | pnpm                                                    |

## Documentation map

This file is the navigation hub. Every domain has a folder under `docs/` with two files:

- **Definition (`<AREA>.md`)** — what lives in this area, the architectural decisions, the public surface.
- **Patterns (`patterns.md`)** — the recipe agents must follow when writing code in this area.

| Area     | Definition                          | Patterns                            |
| -------- | ----------------------------------- | ----------------------------------- |
| Backend  | [`docs/backend/BACKEND.md`](docs/backend/BACKEND.md)   | [`docs/backend/patterns.md`](docs/backend/patterns.md)   |
| Frontend | [`docs/frontend/FRONTEND.md`](docs/frontend/FRONTEND.md) | [`docs/frontend/patterns.md`](docs/frontend/patterns.md) |
| Design   | [`docs/design/DESIGN.md`](docs/design/DESIGN.md)         | [`docs/design/patterns.md`](docs/design/patterns.md)     |

The canonical system design lives at [`docs/PLAN.md`](docs/PLAN.md). When the plan and the area docs disagree, the area docs win — the plan is a snapshot in time.

Per-folder `CLAUDE.md` files (in `convex/`, `convex/lib/`, `scripts/`, `src/`, `src/routes/*`, `src/components/`, `src/hooks/`, `src/lib/`) describe what belongs in that folder and what doesn't. Agents must read the folder's `CLAUDE.md` before adding new files.

## Doc-update rule (read this if you change anything)

**Whenever you change a module, update its corresponding doc in the same change.**

- Touched a Convex function or schema? → update `docs/backend/BACKEND.md` (and `patterns.md` if you introduced a new pattern).
- Touched a route, page, component, or shared hook? → update `docs/frontend/FRONTEND.md` (and `patterns.md` if needed).
- Touched the theme, tokens, or visual conventions? → update `docs/design/DESIGN.md` and `docs/design/patterns.md`.
- Added a new folder? → write its `CLAUDE.md` immediately.

A change without a matching doc update is incomplete.

## Common commands

```bash
pnpm install                                  # install
pnpm dev                                      # convex dev + vite dev (interactive)
pnpm exec convex run seed:run                 # seed roles/permissions/team/users/sample data
pnpm tsc -b                                   # type-check
pnpm lint                                     # type-check + ESLint
pnpm test                                     # all tests (backend + frontend)
pnpm test:backend                             # convex/__tests__ only (edge-runtime)
pnpm test:frontend                            # src/__tests__ only (jsdom + RTL)
pnpm test:coverage                            # all tests with coverage report
pnpm deploy                                   # lint + tests → convex deploy + vite build (tests gate the deploy)
```

**Deploy gating:** `pnpm deploy` runs `predeploy` first (`pnpm lint && pnpm test`). Any failing test or lint error aborts the deploy before anything is pushed. Never bypass this with `--ignore-scripts` or by calling `convex deploy` directly.

## Conventions

- **camelCase** for Convex document fields (e.g., `teamId`); **snake_case** for index names (e.g., `by_team_and_status`), per Convex's official guideline. See `convex/CLAUDE.md`.
- **Money** is stored as integer minor units in `v.number()` (no FX conversion).
- **Indexes are not unique** in Convex — uniqueness is app-enforced via `withIndex(...).unique()`-then-throw.
- **Every state-changing mutation** calls the shared `log()` helper from `convex/lib/activity.ts`.
- **Every Convex function** starts with `requireAuth()` and (when a target id is involved) `requireSameTeam()`.
- **Frontend never attempts to navigate to a forbidden route** — it renders a 403 panel in place.
- **Notification bell shows a red dot only when there are unread items** (count > 0).

## What's NOT in v1

Admin UI, multi-team flows, FX, reimbursement tracking, email notifications, chain-handoff button (backend supports it; UI deferred). See [`docs/PLAN.md` §"Open Items"](docs/PLAN.md).
