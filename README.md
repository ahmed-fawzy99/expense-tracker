# Expense Tracker

**Live preview:** https://expense-tracker-xi-swart-29.vercel.app/

A small internal expense tracker. Employees log expenses with receipts and submit for approval; their assigned manager reviews and approves or rejects. Live in-app notifications keep both sides in sync.

This repo is a working v1: single team, single-tier approvals in the UI (the backend supports multi-tier handoff for a future release), and no admin UI yet — bootstrap and team management happen via the seed script.

## Quick start

> **Prerequisites:** Node 20+, [pnpm](https://pnpm.io) 10+, and a working Convex login (`pnpm dlx convex login` if you haven't).

```bash
pnpm install
pnpm dev          # starts Convex dev + Vite, opens the browser
```

On first launch Convex will provision a local dev deployment and write `.env.local`. After it's up, in another terminal seed the demo data:

```bash
pnpm seed
```

The seed prints a manager + four employee credentials. Sign in with any of them at `http://localhost:5173`.

| Role     | Email                    | Password   |
| -------- | ------------------------ | ---------- |
| Manager  | `super@root.test`        | `password` |
| Employee | `vlad@airdev.test`       | `password` |
| Employee | `employee+1@airdev.test` | `password` |
| Employee | `employee+2@airdev.test` | `password` |
| Employee | `employee+3@airdev.test` | `password` |

Change your password from the user menu (top-right) once you're in.

## What you can do

**As an employee:**

- See all your expenses on `/`, filtered by status / category.
- Create a new expense at `/new` — save it as a draft or submit for approval. Drafts can be edited or deleted; submitted expenses are immutable to you.
- Each expense has its own page (`/expense/:id`) with a status timeline. You'll only see status changes and the rejection reason — never the manager's intermediate workflow.
- Get a notification (red dot in the bell, top-right) when your manager decides.

**As a manager:**

- See pending approvals at `/expenses`.
- Open an expense, review its receipt, and approve or reject (rejection requires a reason).
- The full activity timeline is visible — including handoffs in multi-tier flows.
- Get a notification when an expense is submitted to you.

## How it's built

- **Backend:** [Convex](https://convex.dev) — database, server functions, file storage, live queries. Auth via [`@convex-dev/auth`](https://labs.convex.dev/auth) with the Password provider.
- **Frontend:** React 19 + Vite + [TanStack Router](https://tanstack.com/router) (file-based routes) + Tailwind v4 + [shadcn/ui](https://ui.shadcn.com).
- **Forms:** [react-hook-form](https://react-hook-form.com) + [zod v4](https://zod.dev).
- **Tables:** [TanStack Table](https://tanstack.com/table).
- **Tests:** [Vitest](https://vitest.dev) + [`convex-test`](https://www.npmjs.com/package/convex-test). Backend tests cover permissions, chain logic, expense lifecycle, file validation, and cross-team isolation.

A polymorphic activity log captures every state change. A permissions-driven role system (Spatie-inspired) means new roles plug in via two table inserts — no chain-logic changes.

For the full system design, see [`docs/PLAN.md`](docs/PLAN.md). For module-by-module references, [`docs/backend/BACKEND.md`](docs/backend/BACKEND.md), [`docs/frontend/FRONTEND.md`](docs/frontend/FRONTEND.md), [`docs/design/DESIGN.md`](docs/design/DESIGN.md).

## Common scripts

```bash
pnpm dev                    # Convex dev + Vite
pnpm seed                   # Seed permissions/roles/team/users + sample data (idempotent)
pnpm test                   # Run all tests (backend + frontend)
pnpm test:coverage          # ...with coverage
pnpm tsc -b                 # Type-check
pnpm lint                   # tsc + ESLint (zero-warning policy)
pnpm build                  # Production build → dist/
```

## Deploying

### Local development

```bash
pnpm install
pnpm dev                              # provisions a Convex dev deployment + starts Vite
npx @convex-dev/auth                  # sets JWT_PRIVATE_KEY + JWKS on the dev deployment
pnpm seed                             # bootstrap roles/permissions/team + demo users
```

`pnpm dev` writes `.env.local` with `VITE_CONVEX_URL` pointing at your dev deployment. The auth CLI must be run once per deployment — without it, sign-in fails with `Missing environment variable JWT_PRIVATE_KEY`.

### Production

**1. Convex backend**

```bash
pnpm dlx convex deploy                # creates the prod deployment, prints its URL
npx @convex-dev/auth --prod           # generates + sets JWT_PRIVATE_KEY and JWKS on prod
pnpm dlx convex env set SITE_URL "https://<your-vercel-domain>" --prod
pnpm dlx convex run seed:run --prod   # bootstrap roles/permissions/team in prod
```

`SITE_URL` must match the Vercel domain or auth callbacks will break.

**2. Vercel frontend**

1. Push the repo to GitHub and import it into Vercel.
2. Set environment variables (Production scope):
   - `VITE_CONVEX_URL` — the Convex prod deployment URL (baked into the client bundle at build time).
   - `CONVEX_DEPLOY_KEY` — a Production deploy key from the Convex dashboard (Settings → Deploy Keys).
3. Build settings:
   - Install command: `pnpm install`
   - Build command: `pnpm lint && pnpm test && convex deploy --cmd 'pnpm build'` (lint + tests gate the deploy, then Convex backend is pushed and the Vite frontend is built in one step)
   - Output directory: `dist`

Changing `VITE_CONVEX_URL` requires a Vercel rebuild — it's compiled into the bundle, not read at runtime.

### Preview deployments (Vercel + Convex preview)

For per-PR previews, use a Convex Preview deploy key and seed automatically as part of the preview build:

1. In Convex dashboard → Settings → Deploy Keys, create a **Preview** deploy key.
2. In Vercel, set `CONVEX_DEPLOY_KEY` (Preview scope) to that key. Convex will spin up a fresh preview deployment per PR and inject `VITE_CONVEX_URL` automatically.
3. Override the preview build command to seed on every preview:
   ```bash
   pnpm lint && pnpm test && convex deploy --cmd 'pnpm build' --preview-run "seed:run"
   ```
4. Run the auth CLI once against the preview deployment (or set `JWT_PRIVATE_KEY` / `JWKS` as Convex *default* preview env vars in the dashboard so every new preview inherits them).

Each preview gets a fresh seeded database; Convex tears it down when the PR closes.

