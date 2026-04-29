# Expense Tracker — System Design Plan

> Stage: system design only. No functional requirements added beyond those the user already stated. This document defines architecture, data model, and component boundaries; implementation details are deferred.

---

## Context

The user is building an internal company expense tracker. Employees log expenses with receipts and submit for approval; the assigned manager reviews and may approve, reject, or extend the approval chain by adding another manager (sequential, discretionary). The app supports multiple teams scoped by branch/location (many teams may live in the same country — country is **not** a scoping dimension in this design). Each user belongs to exactly one team and one direct manager. This plan locks in the architectural decisions surfaced through clarifying Q&A before any code is written.

---

## Confirmed Decisions

| Topic                                           | Decision                                                                                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend / DB / file storage / server fns / auth | **Convex** (single platform)                                                                                                                                                                                                          |
| Frontend                                        | **React** (Vite). Next.js only if a separate backend were required — it isn't, since Convex covers backend                                                                                                                            |
| Auth provider                                   | `@convex-dev/auth` Password provider (already in `package.json`). The `users` table is **owned by `authTables`** and extended with domain fields (`teamId`, `managerId`, `createdBy`); we do not define a parallel users table        |
| Multi-tenancy                                   | Shared DB; **`teamId` is denormalized onto every team-scoped table** (`expenses`, `approvals`, `notifications`, `activityLog`, `userRoles`). Convex has no SQL JOIN, so cross-table filtering must hit a single index. Access enforced inside every Convex function |
| Currency                                        | Per-expense currency. `teams.defaultCurrency` defaults to `"USD"` at the schema level. **No FX snapshot, no conversion stored**                                                                                                       |
| Roles                                           | **Spatie-inspired roles + permissions** (many-to-many, no polymorphism — only users have roles). Seeded roles: `admin`, `manager`, `employee`. A user may hold one or many roles. `admin` role implies all permissions                |
| Manager relation                                | Each user has exactly one direct `managerId` (nullable). Users with null `managerId` cannot submit                                                                                                                                    |
| Approval chain                                  | Sequential additive — at most one pending step at a time. The current approver may, in the same action, add the next approver before approving                                                                                        |
| Chain eligibility                               | Any same-team user holding the `manager` role, not already in the chain. (System checked via permission `expenses.approve` so future roles can become eligible without changing chain code)                                           |
| Onboarding                                      | Admin-only onboarding via **`createAccount` from `@convex-dev/auth/server`**: the Admin mutation mints the credential (admin-supplied temporary password), then patches the new user row with `teamId` / `managerId` / role assignments. User changes the temp password on first login. **No invites table in v1.** Initial Admin per team seeded by an ops script |
| Receipt                                         | Exactly one file per expense. Image (PNG/JPEG/WEBP) or PDF. ≤ 10 MB. Stored in Convex file storage                                                                                                                                    |
| Statuses                                        | `draft` → `pending` → `approved` / `rejected`. Drafts visible only to their owner. Once submitted (`pending`), the expense is immutable to the submitter                                                                              |
| Notifications                                   | In-app only, driven by Convex live queries. No email in v1                                                                                                                                                                            |
| Audit trail                                     | **Polymorphic activity log** (Spatie-inspired) implemented as a **table-level discriminated union** (`v.union` of typed variants — Convex's idiomatic equivalent). One table covers any model now or later (expenses, users, …) while keeping `v.id(...)` type safety. Manager/Admin views read everything; submitter sees only `status_changed` events plus the final rejection reason |
| Localization                                    | Deferred. Team carries `name` + `defaultCurrency`. No country, no i18n / locale formatting in v1                                                                                                                                     |
| Reimbursement                                   | Out of scope. Tracking only                                                                                                                                                                                                           |
| List filters (v1)                               | Status, date range, category                                                                                                                                                                                                          |
| Categories                                      | Fixed global list. Per-team configuration deferred                                                                                                                                                                                    |
| Naming convention                               | All Convex document fields use **camelCase** (e.g., `teamId`, not `team_id`). Index names use **snake_case** (`by_team_and_status`) per Convex's official guideline; documented in `convex/CLAUDE.md`                                                                                                                                                          |
| Money                                           | `amount` stored as integer **minor units** with `v.number()` (float64 safely represents integers up to `2^53 − 1`, plenty for any business expense). No `v.int64()`, no FX conversion stored                                          |
| Indexes & uniqueness                            | Convex indexes are **not unique** — they only accelerate queries. All "(unique)" annotations below are **app-enforced** inside the create mutation via `withIndex(...).unique()`-then-throw. (For `users.email`, Convex Auth itself enforces uniqueness on signup, so we inherit it from `authTables`.)                                                                                                                                                          |

---

## Architecture Overview

```
+-------------------+   queries / mutations / live subscriptions
|   React (Vite)    | <-------------------------------------------->  Convex backend
|   client app      |                                                 - schema + DB
+-------------------+                                                 - server functions
        |                                                             - file storage (receipts)
        +-- Convex Auth (password)                                    - live queries (notifications)
```

Single deployment. The React client talks to Convex directly via the Convex React hooks; there is no separate Node API server. Authorization lives entirely server-side. The client mirrors the user's permission set only to **gate the UI** (it hides links, suppresses redirects, and renders 403 in-place) — it never _attempts_ to navigate to a route the user lacks permission for.

---

## Project Structure

```
Employee/
├── PLAN.md                          # mirror of this plan, created on approval
├── CLAUDE.md                        # repo-level orientation for agents (stack, conventions, entry points)
├── package.json
├── vite.config.ts
├── convex/
│   ├── CLAUDE.md                    # purpose: server-side Convex functions + schema; auth/team guards live here
│   ├── schema.ts                    # tables + indexes (camelCase fields)
│   ├── auth.config.ts               # Convex Auth provider config
│   ├── auth.ts                      # signup/login helpers, identity → user lookup
│   ├── teams.ts                     # team queries + admin mutations
│   ├── users.ts                     # admin-only create-user + role/manager assignment
│   ├── roles.ts                     # role + permission queries; assignment mutations
│   ├── expenses.ts                  # draft, submit, list (per-role), get
│   ├── approvals.ts                 # approve, reject, approve-with-handoff
│   ├── activity.ts                  # polymorphic activity log: append + role-filtered reads
│   ├── notifications.ts             # in-app notification queries + read-marking
│   ├── files.ts                     # upload-url issuance, gated receipt URL fetch
│   └── lib/
│       ├── CLAUDE.md                # purpose: shared server-only helpers — auth/permissions, chain math, activity logging
│       ├── permissions.ts           # requireAuth / requireSameTeam / requirePermission
│       ├── chain.ts                 # chain advancement + duplicate-approver guard
│       └── activity.ts              # log() helper used by every state-changing mutation
├── scripts/
│   ├── CLAUDE.md                    # purpose: one-off ops scripts (seed, migrations) — not invoked by the app at runtime
│   └── seed.ts                      # ops bootstrap: seed roles+permissions, create team + first Admin
└── src/
    ├── CLAUDE.md                    # purpose: React (Vite) client; talks to Convex via hooks; auth lives server-side, UI only gates
    ├── main.tsx
    ├── App.tsx
    ├── routes/
    │   ├── CLAUDE.md                # purpose: route-level pages grouped by audience role; permission-gated, no forbidden-redirect attempts
    │   ├── auth/                    # login
    │   │   └── CLAUDE.md            # purpose: unauthenticated routes (login); only place rendered when user has no session
    │   ├── employee/                # dashboard, new-expense, my-expense detail
    │   │   └── CLAUDE.md            # purpose: submitter-facing pages — draft/submit/track own expenses
    │   ├── manager/                 # pending queue, history, review
    │   │   └── CLAUDE.md            # purpose: approver-facing pages — review queue, approve/reject/handoff, history
    │   └── admin/                   # users, team settings
    │       └── CLAUDE.md            # purpose: admin-only pages — user/role management, team settings; gated by users.manage / team.manage
    ├── components/
    │   ├── CLAUDE.md                # purpose: presentational + feature-level shared components; no Convex calls inside dumb components
    │   ├── ExpenseForm.tsx
    │   ├── ExpenseList.tsx          # shared list w/ status/date/category filters
    │   ├── ApprovalChainPanel.tsx   # chain view (manager-side)
    │   ├── ActivityLog.tsx          # role-aware activity log renderer
    │   ├── ReceiptUploader.tsx
    │   └── NotificationBell.tsx
    ├── hooks/                       # thin wrappers over Convex hooks (useMe, useMyPermissions)
    │   └── CLAUDE.md                # purpose: thin wrappers around Convex hooks — useMe, useMyPermissions; centralizes identity reads
    └── lib/
        ├── CLAUDE.md                # purpose: client-only utilities — route guards, formatting; no business logic
        └── route-guards.tsx         # permission-aware route gating (no redirect-attempt anti-pattern)
```

**CLAUDE.md per folder:** every folder above gets a short `CLAUDE.md` describing its responsibility, what belongs there, what does **not** belong there, and which sibling/parent folder owns adjacent concerns. The goal is that any agent (or human) opening a folder can immediately understand its role without reading the whole codebase. This shouldn't be a long document, a few sentences per folder is sufficient.

---

## Data Model (Convex schema, camelCase)

Convex stores documents per collection. Below, "FK" is shorthand for a Convex `id<table>` reference. All field names are camelCase.

### Identity & access

**teams**

- `name` (string, free-text branch/office identifier — e.g., `"HQ"`, `"Cairo Office"`)
- `defaultCurrency` (string, ISO-4217; default `"USD"` enforced by the create-team mutation, since Convex schemas don't have column-default values)
- `_creationTime` (system field) replaces a custom `createdAt`.

**users** (one row per human — **owned by `@convex-dev/auth`'s `authTables.users`**, extended with domain fields)

- spreads `...authTables.users.validator.fields` (provides `email`, `phone`, `name`, `image`, … managed by Convex Auth)
- `teamId` (FK teams)
- `managerId` (FK users, nullable)
- `createdBy` (FK users, nullable — the Admin who created the record via `createAccount`)
- _Indexes:_ `email` (required by `authTables`, so kept under that name; uniqueness enforced by Convex Auth), `by_team`, `by_team_and_manager`.
- Password material lives in `authTables.authAccounts`, not on this row.
- `_creationTime` (system field) replaces a custom `createdAt`.

**roles** (global definitions)

- `name` (string — e.g., `"admin" | "manager" | "employee"`)
- `description` (string, nullable)
- _Index:_ `by_name` (app-enforced unique).
- `_creationTime` (system field).
- Seeded once at deployment; not user-editable in v1.

**permissions** (global)

- `name` (string, dotted — e.g., `"expenses.create"`, `"expenses.approve"`, `"users.manage"`, `"activity.read.full"`)
- `description` (string, nullable)
- _Index:_ `by_name` (app-enforced unique).
- `_creationTime` (system field).

**rolePermissions** (many-to-many)

- `roleId` (FK roles)
- `permissionId` (FK permissions)
- _Indexes:_ `by_role`, `by_permission` (the latter drives the chain-eligibility forward-resolution described under "Auth, Roles, and Authorization"). App-enforced unique on `(roleId, permissionId)` via a `by_role_and_permission` index checked before insert.

**userRoles** (many-to-many; team-scoped assignment so the same global role can be granted in distinct teams)

- `userId` (FK users)
- `roleId` (FK roles)
- `teamId` (FK teams) — must equal `users.teamId`
- `assignedBy` (FK users, nullable)
- `assignedAt` (number)
- _Indexes:_ `by_user`, `by_user_and_role_and_team` (app-enforced unique on the triple — checked before insert), `by_team_and_role` (enables "list all managers in this team"), `by_role_and_team` (enables forward-resolution from `rolePermissions.by_permission` → roleIds → users).

**Permission resolution** (`convex/lib/permissions.ts`):

```
permissionsFor(user) =
  if user has role "admin" → ALL permissions
  else                     → ⋃ rolePermissions over userRoles[user]
```

Cached per Convex function invocation. The chain-eligibility check uses `expenses.approve`, not the literal role name, so that adding a future role (e.g., `senior_manager`) with `expenses.approve` permission makes that user eligible without touching `chain.ts`.

**Chain-eligibility resolution algorithm** (`convex/lib/chain.ts`, v1):

1. `permissions.by_name` → `permissionId` for `"expenses.approve"`.
2. `rolePermissions.by_permission` → set of `roleId`s that grant it.
3. For each `roleId`, `userRoles.by_role_and_team` → user ids in the caller's team.
4. Dedup, drop users already in the chain, drop the submitter.

This forward-resolution keeps the system "permission-driven" (claim from the
Confirmed Decisions table) while staying within Convex indexes. For v1 with three
seeded roles the cost is small (≤ 3 sub-queries per chain-eligibility call). If
roles proliferate later, swap to a materialized `userPermissions` view denormalized
on role/role-permission writes.

### Domain

**expenses** (carries `teamId` — denormalized at submit time, never re-synced because v1 forbids team transfers)

- `teamId` (FK teams) — written from `submitter.teamId` at insert; immutable
- `submitterId` (FK users)
- `description` (string)
- `amount` (number, stored as integer in minor units; `v.number()` is float64 and safely represents integers up to `2^53 − 1`, far above any business expense)
- `currency` (string, ISO-4217)
- `category` (string, from fixed global list)
- `receiptStorageId` (`Id<"_storage">`, nullable while `draft`)
- `status` (`"draft" | "pending" | "approved" | "rejected"`)
- `submittedAt` (nullable), `decidedAt` (nullable)
- `_creationTime` (system field) replaces a custom `createdAt`.
- _Indexes:_ `by_submitter_and_status`, `by_submitter_and_category`, `by_submitter_and_submitted_at` (owner views), `by_team_and_status`, `by_team_and_category`, `by_team_and_submitted_at` (team-wide / admin / future-reporting views — single index hit, no fan-out).

**approvals** (the chain — one row per slot; **keeps `teamId`** for hot-path queries)

- `expenseId` (FK expenses)
- `teamId` (FK teams)
- `position` (number, 1..n)
- `approverId` (FK users)
- `state` (`"pending" | "approved" | "rejected"`)
- `decidedAt` (number, nullable)
- `decisionNote` (string, nullable)
- _Indexes:_ `by_expense`, `by_approver_and_state` (manager pending queue), `by_approver_and_decided_at` (manager history).

**activityLog** (Spatie-inspired, polymorphic — covers expenses today, anything tomorrow). **Implemented as a table-level discriminated union** (`v.union` of typed variants inside `defineTable`). Each variant carries `subjectType` (literal), a typed `subjectId: v.id(<concrete table>)`, and the shared fields below. This preserves Convex's `Id<"table">` type safety while remaining polymorphic.

Shared fields (present on every variant):

- `subjectType` (`v.literal("expenses")` | `v.literal("users")` | …) — the discriminator
- `subjectId` (`v.id(...)` — typed per variant; never a bare string)
- `teamId` (FK teams) — denormalized; required so admin team-wide audit is a single index hit
- `causerId` (FK users, nullable for system events)
- `event` (per-variant `v.union` of `v.literal(...)` events, e.g. `"submitted" | "approved" | "rejected" | "chain_extended" | "status_changed"` for the `expenses` variant; `"user.created" | "role.assigned"` for the `users` variant)
- `description` (string, human-readable summary)
- `properties` (`v.any()` — escape hatch; each event has its own shape, narrowed in `convex/lib/activity.ts` by a Zod-style helper)
- `_creationTime` (system field) replaces a custom `createdAt`.
- _Indexes:_ `by_subject` (on `[subjectType, subjectId]`), `by_team_and_created` (team-wide audit), `by_causer`.

**notifications** (carries `teamId` — denormalized for the same reason as `expenses`)

- `userId` (FK users)
- `teamId` (FK teams) — written at insert from the recipient's `users.teamId`
- `type` (`v.union(v.literal("approval_requested"), v.literal("expense_decided"), v.literal("chain_extended"))`)
- `subjectType` (literal — currently always `"expenses"`)
- `subjectId` (typed `v.id("expenses")` — kept narrow until a second subject is needed)
- `message` (string)
- `readAt` (number, nullable)
- `_creationTime` (system field) replaces a custom `createdAt`.
- _Indexes:_ `by_user_and_unread` (recipient bell), `by_team_and_created` (future admin notification audit).

---

## Approval Chain Mechanics

**Invariant:** an expense whose `status = pending` has exactly **one** `approvals` row with `state = pending` — the _current pending approver_.

**State transitions** (each is one atomic Convex mutation):

- `submit(expenseId)` — `draft → pending`. Insert `approvals` row at `position = 1` with `approverId = submitter.managerId`, `state = pending`. Submitter must have non-null `managerId`.
- `approve(stepId, { addNextApproverId? })` — current approver acts:
  - Validate: caller is `approverId` of the step, step is `pending`. If `addNextApproverId` provided: target is same-team, target has permission `expenses.approve`, target is not already in the chain, target is not the submitter.
  - Mark current step `approved`.
  - If `addNextApproverId` is provided: insert a new step at `position+1` with `state = pending`. Append `chain_extended` activity event.
  - Else (terminal): set `expenses.status = approved`, set `decidedAt`. Append `approved` and `status_changed` activity events.
- `reject(stepId, { note })` — mark current step `rejected`, set `expenses.status = rejected`, set `decidedAt`. Append `rejected` and `status_changed` activity events with `note`.

(There is **no** queued/superseded state. The chain only ever holds steps that have already happened plus exactly one pending step at the head — handoff and pending-promotion are the same atomic insert.)

**Listings derived from this model:**

- Manager pending queue → `approvals.by_approver_and_state` filtered by `state = "pending"` and `approverId = me`.
- Manager history → `approvals.by_approver_and_decided_at` for `me`.
- Employee my-expenses → `expenses.by_submitter_and_status`.
- Admin / team-wide expense list → `expenses.by_team_and_status`, `expenses.by_team_and_category`, `expenses.by_team_and_submitted_at` (single index hit; no fan-out through `users.by_team`).
- Admin team audit → `activityLog.by_team_and_created`.

**Cross-cutting guards** (`convex/lib/permissions.ts` + `chain.ts`): every mutation/query begins with `requireAuth()` and (when a target id is involved) `requireSameTeam(targetTeamId)`. Self-approval and duplicate approvers are blocked centrally.

---

## Auth, Roles, and Authorization

- `@convex-dev/auth` (Password provider) issues sessions and owns the `users` table via `authTables`. `auth.ts:getMe` calls `getAuthUserId(ctx)` and `ctx.db.get(userId)` to resolve the caller's `users` row directly (no separate `tokenIdentifier` mapping table — the auth user id IS the row id), then attaches the cached permission set.
- Roles are **flexible and additive** (Spatie-style):
  - `users` carry no `isAdmin` / `isManager` columns.
  - Effective permissions = `admin` shortcut OR union of `rolePermissions` across the user's `userRoles`.
  - Future roles (e.g., `finance`, `senior_manager`) plug in without code changes — they only need permission rows + role-permission links and a UI to assign them.
- Server-side helpers used by every function:
  - `requireAuth()` → resolves the caller's `users` row.
  - `requireSameTeam(teamId)` → caller's `teamId` matches.
  - `requirePermission("expenses.approve")` etc. — admin role short-circuits to allow.
- The client receives the user's permission set via `useMyPermissions()` and uses it to:
  - Hide nav links the user can't use.
  - Render an in-place "403 — not available" panel rather than attempting to navigate to a forbidden route.
- Cross-team reads/writes are never possible. There is no super-admin code path.

### Seeded permissions (initial set, extensible)

| Permission           | Description                                                              |
| -------------------- | ------------------------------------------------------------------------ |
| `expenses.create`    | Submit own expenses (drafts + submit)                                    |
| `expenses.read.own`  | Read one's own expenses + their owner-filtered activity log              |
| `expenses.approve`   | Eligible to appear as approver in a chain (drives Manager pending queue) |
| `expenses.read.team` | Read all expenses across own team (admin)                                |
| `users.manage`       | Create users, set their roles, assign their `managerId`                  |
| `team.manage`        | Edit team settings (name, defaultCurrency)                               |
| `activity.read.full` | Read full activity log for any subject in the same team                  |

Default role grants:

- `employee` → `expenses.create`, `expenses.read.own`
- `manager` → `expenses.create`, `expenses.read.own`, `expenses.approve`, `activity.read.full`
- `admin` → all permissions (via shortcut, not enumerated)

---

## Activity Log (Spatie-inspired, polymorphic)

Every state-changing mutation calls a single helper:

```
log({ subjectType, subjectId, causerId, event, description, properties })
```

written inside the same Convex transaction.

Reader functions:

- `activity.listForSubject(subjectType, subjectId)` — full log; requires permission `activity.read.full` _or_ the caller is the subject's owner (e.g., expense submitter for `subjectType="expenses"`).
- `activity.listForOwner(subjectType, subjectId)` — owner-restricted view; for `expenses` returns only `status_changed` events plus the rejection note when terminal-rejected. Hand-offs and intermediate approver actions are filtered out.

This satisfies "manager sees it all; submitter sees only status changes," while leaving the table reusable for `users`, `teams`, or any future model without schema migration.

---

## Notifications

In-app only. Triggered server-side inside the mutation that produced the action:

- `submit` → notify the initial approver (`approval_requested`).
- `approve` with handoff → notify the new pending approver (`approval_requested`).
- `approve` (terminal) → notify the submitter (`expense_decided`).
- `reject` → notify the submitter (`expense_decided` carrying the rejection note).

The bell component subscribes via Convex live queries on `notifications.by_user_and_unread`. Marking as read is a single mutation.

---

## File Storage (Receipts)

- Upload: client calls `files.generateUploadUrl()` (auth required), receives a one-shot URL, PUTs the file. The upload URL itself does **not** validate MIME or size — Convex returns an `Id<"_storage">` regardless of payload.
- **Validation runs in the mutation that binds the storage id to an expense** (`expenses.attachReceipt` or `expenses.submit`). The mutation reads metadata from the system table (`ctx.db.system.get(storageId)`), enforces MIME ∈ {`image/png`, `image/jpeg`, `image/webp`, `application/pdf`} and `size ≤ 10 MB`, and on failure throws *and* calls `ctx.storage.delete(storageId)` so the orphaned blob doesn't linger. Exactly one file per expense.
- Read: `files.getReceiptUrl(expenseId)` calls `ctx.storage.getUrl(storageId)` and returns the signed URL only when caller is the submitter, an approver currently or previously in the chain, or holds permission `expenses.read.team`.

---

## Currency Handling

Each expense persists `amount` and `currency`. **No FX rate is stored**, no conversion is computed. The team's `defaultCurrency` (default `"USD"`) is used only as a hint for UI defaulting and for display headers; cross-currency math is out of scope for v1.

---

## Bootstrapping

`scripts/seed.ts` is a one-off Convex action (Node runtime — `"use node";`) invoked by an operator. It:

1. Seeds the global `permissions` rows (idempotent — `by_name.unique()` check before insert).
2. Seeds the global `roles` rows: `admin`, `manager`, `employee` (idempotent).
3. Seeds `rolePermissions` for the seeded roles (idempotent on `(roleId, permissionId)`).
4. Creates a team with the supplied `name` and (optional) `defaultCurrency` (defaults to `"USD"`).
5. Creates the initial Admin user via **`createAccount` from `@convex-dev/auth/server`** with the operator-supplied email + temporary password, then patches the new `users` row with `teamId`, and inserts a `userRoles` row granting `admin`.

After this, the Admin signs in with that temp password and uses the in-app admin pages to create the rest of the team's users — each via the same admin mutation that wraps `createAccount` + post-create profile patch.

---

## State Machine Summary

```
(none) -- create draft -----------> draft
draft  -- submit -----------------> pending
draft  -- delete (owner only) ----> (gone)
pending -- last approver approves -> approved   [terminal]
pending -- any approver rejects ---> rejected   [terminal]
pending -- approver hands off -----> pending    (current pending step pointer advances)
```

Drafts are the only mutable expense state; everything from `pending` onward is immutable to the submitter.

---

## Localization (deferred)

Team holds `name` and `defaultCurrency`. No country field, no separate location/branch column (the team's `name` doubles as its branch identifier). No translations, no locale-specific number/date formatting, no per-team timezone in v1. The architecture is i18n-ready: adding a translation library later does not require a schema change.

---

## Critical Files

**Pre-step — clean placeholders before writing the real schema:**

- Delete the `numbers` table from `convex/schema.ts` (`convex init` placeholder).
- Delete `convex/myFunctions.ts` (matching demo file).

**To be created:**

- `convex/schema.ts` — extend `...authTables`, add the extended `users` table and every domain table + index above (camelCase fields, snake_case index names per Convex's official guideline; documented in `convex/CLAUDE.md`).
- `convex/lib/permissions.ts` — auth/team guards + permission resolution (uses `getAuthUserId` from `@convex-dev/auth/server`).
- `convex/lib/chain.ts` — chain advancement, duplicate-approver guard, eligibility via the forward-resolution algorithm above (uses `expenses.approve` permission).
- `convex/lib/activity.ts` — single `log()` helper used by every state-changing mutation; narrows `properties` per event variant.
- `convex/expenses.ts`, `convex/approvals.ts`, `convex/activity.ts`, `convex/notifications.ts`, `convex/files.ts`, `convex/users.ts`, `convex/roles.ts`, `convex/teams.ts`
- `scripts/seed.ts` — bootstrap (permissions + roles + first team + Admin via `createAccount`).
- `src/App.tsx` + `src/lib/route-guards.tsx` — permission-aware UI gating (no redirect-attempt to forbidden routes).
- `src/components/ExpenseForm.tsx`, `ExpenseList.tsx`, `ApprovalChainPanel.tsx`, `ActivityLog.tsx`, `ReceiptUploader.tsx`, `NotificationBell.tsx`

---

## Verification

End-to-end test path once implemented:

1. Run `npm run dev` (which runs `convex dev` + `vite`). Run `scripts/seed.ts` to seed permissions+roles, create Team A (`name="HQ"`; `defaultCurrency` left blank → defaults to `"USD"`), and create Admin A via `createAccount`. Confirm `convex/schema.ts` boots with `...authTables` spread + the extended `users` table without "table redefined" errors. Confirm the `numbers` placeholder table and `convex/myFunctions.ts` are gone.
2. As Admin A, create Manager M1, Manager M2, and Employee E (each via the admin mutation that wraps `createAccount` + profile patch). Assign roles (`manager` to M1+M2, `employee` to E). Set `E.managerId = M1`.
3. As E, create a draft, attach a 2 MB JPEG receipt, submit. Confirm:
   - E sees status `pending`.
   - M1 sees the expense in the pending queue; M1's bell increments.
4. As M1, approve **with handoff** to M2. Confirm:
   - M1's pending queue empties; M1's history shows the expense.
   - M2's pending queue gains the expense; M2's bell increments.
   - E's owner-filtered activity log shows only `status_changed` (still `pending`); manager view shows full log incl. `chain_extended`.
5. As M2, reject with reason "missing itemized total". Confirm:
   - Expense terminal `rejected`.
   - E's bell increments; E sees the rejection note in the owner-filtered activity log.
6. Negative tests:
   - User in Team B cannot read any Team A document.
   - M1 cannot add themselves as the next approver (self-approval blocked).
   - M1 cannot add E (E lacks `expenses.approve` — chain-eligibility forward-resolution returns no role for E).
   - Adding a user already in the chain is blocked.
   - Uploading a 12 MB file or a `.exe`: the upload URL accepts the bytes, but the binding mutation reads `_storage` metadata, throws, and `ctx.storage.delete`s the orphaned blob.
   - A user with `managerId = null` cannot submit.
   - Submitted/approved/rejected expenses cannot be edited or re-uploaded.
   - Inserting a duplicate `permissions.name` or `roles.name` is rejected by the app-level uniqueness check (Convex indexes are not unique).
   - A future role with `expenses.approve` granted via `rolePermissions` correctly appears as a chain-eligibility candidate (no `chain.ts` change required).
   - Visiting `/admin/users` as a non-admin renders the in-place 403 panel; the client does **not** attempt to navigate then redirect.
7. Filters: verify `Status`, `Date range`, and `Category` filters on each role-specific list view (employee uses `by_submitter_and*`; admin uses `by_team_and*` indexes — confirm by reading the function source, not just by output).

---

## Open Items For Implementation Phase (not part of this design)

- Final UI design choices (component library, theming).
- Concrete `@convex-dev/auth` Password configuration (email verification on/off; v1 is likely off — the admin-set temp password flow makes verification redundant for v1).
- Admin UX for creating users and assigning roles + manager (the admin mutation wrapping `createAccount` + profile patch is locked; the *form* design is open).
- Whether to materialize a `userPermissions` view if/when roles proliferate beyond v1's three seeded roles.
