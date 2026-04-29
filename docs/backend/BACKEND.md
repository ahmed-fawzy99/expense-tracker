# Backend — Convex Module Reference

The backend is a single Convex deployment. There is **no** separate Node API server. The React client talks to Convex directly via the Convex React hooks.

> Source-of-truth for design decisions: [`../PLAN.md`](../PLAN.md). This file documents the **current implementation surface** (functions, schema, helpers). Update both when behavior changes.

## Layout

```
convex/
├── schema.ts              # All tables + indexes (camelCase fields, snake_case index names)
├── auth.ts                # @convex-dev/auth wiring + getMe query
├── auth.config.ts         # Auth provider config
├── http.ts                # HTTP routes (Convex auth needs them)
├── lib/
│   ├── permissions.ts     # requireAuth, requireSameTeam, requirePermission, permissionsFor
│   ├── chain.ts           # eligibleApprovers, chain guards
│   └── activity.ts        # log() helper used by every state-changing mutation
├── teams.ts               # Team queries + admin mutations
├── users.ts               # Admin-only createUser (wraps createAccount), profile reads
├── roles.ts               # Role + permission queries; assignment mutations
├── expenses.ts            # draft, attachReceipt, submit, get, listMine, listForTeam
├── approvals.ts           # approve, approveWithHandoff, reject
├── activity.ts            # Polymorphic activity log: append + role-filtered reads
├── notifications.ts       # Live notification queries + read marking
└── files.ts               # Upload-url issuance, gated receipt URL fetch
```

`convex/seed.ts` is a Node action (`"use node";`) — it bootstraps roles, permissions, the team, the manager, employees, and sample expenses. Run with `pnpm seed`.

## Schema overview

Document field names use **camelCase**; index names use **snake_case** (Convex's official guideline). All money is stored as integer minor units in `v.number()`. `_creationTime` system field replaces every custom `createdAt`.

| Table             | Purpose                                                               | Notable indexes                                                              |
| ----------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `users`           | Owned by `authTables.users`, extended with `teamId`, `managerId`, `createdBy` | `by_team`, `by_team_and_manager`                                                 |
| `teams`           | Branch/office identifier (`name`) + `defaultCurrency` (default `USD`) | —                                                                            |
| `roles`           | Global definitions (admin, manager, employee). `permissionNames: string[]` is a denormalized cache of grants, populated by seed and read by `permissionsFor`. | `by_name` (app-enforced unique)                                               |
| `permissions`     | Global, dotted names (`expenses.create`, etc.)                        | `by_name` (app-enforced unique)                                               |
| `rolePermissions` | Many-to-many: role ↔ permission. Kept as the canonical reverse-lookup index used by `chain.ts` (`permissions.by_name → rolePermissions.by_permission → userRoles.by_role_and_team`). | `by_role`, `by_permission`, `by_role_and_permission` (app-enforced unique)        |
| `userRoles`       | User-role assignment, team-scoped                                     | `by_user`, `by_user_and_role_and_team` (unique), `by_team_and_role`, `by_role_and_team`  |
| `expenses`        | The expense doc                                                       | `by_submitter_and_status`, `by_team_and_status`, `by_team_and_submitted_at`, `by_team_and_category`, `by_submitter_and_category`, `by_submitter_and_submitted_at` |
| `approvals`       | One row per chain step (≤1 pending at a time)                         | `by_expense`, `by_approver_and_state`, `by_approver_and_decided_at`                  |
| `activityLog`     | Polymorphic — discriminated union (`subjectType` literal + typed `subjectId`) | `by_subject` (`subjectType + subjectId`), `by_team_and_created`, `by_causer`      |
| `notifications`   | In-app, live                                                          | `by_user_and_unread`, `by_team_and_created`                                        |

See [`../PLAN.md` §"Data Model"](../PLAN.md) for full field-level detail.

## Function surface

All functions begin with `requireAuth()`; team-touching functions also call `requireSameTeam()`; permission-gated functions call `requirePermission()`. State-changing mutations call `log()` in the same transaction.

### `auth.ts`

- `getMe` — query. Returns `{ user, permissions: string[] } | null`. Drives every `useMe()`/`useMyPermissions()` call on the client.

### `teams.ts`

- `get` — query. Returns the caller's team.
- `update` — mutation. Permission: `team.manage`. Patches name / `defaultCurrency`.

### `users.ts`

- `getMe` — query. Same as `auth.getMe` (re-exported for convenience).
- `listForTeam` — query. Permission: `users.manage` (admin only). For seed/admin tools.
- `createUser` — internal action. Wraps `createAccount` from `@convex-dev/auth/server`, then patches `teamId` / `managerId` / role assignments. Used by the seed script. (No public admin UI in v1.)
- `setManager` — mutation. Permission: `users.manage`. Used by future admin UI.

### `roles.ts`

- `list` — query. Lists all roles (used by future admin UI; also by seed verification).
- `assignToUser` — mutation. Permission: `users.manage`. Inserts a `userRoles` row.

### `expenses.ts`

- `createDraft` — mutation. Permission: `expenses.create`. Inserts a `draft` row owned by the caller.
- `updateDraft` — mutation. Owner-only, status must be `draft`.
- `attachReceipt` — mutation. Validates `_storage` metadata (≤10MB, allowed MIME) — on failure throws and `ctx.storage.delete`s the orphan.
- `submit` — mutation. Permission: `expenses.create`. Caller must be owner; `managerId` must be non-null. Inserts the position-1 `approvals` row at the caller's manager. Logs `submitted` + `status_changed`. Notifies the approver.
- `editAndResubmit` — mutation. Owner-only, status must be `rejected`. Patches the expense fields (same set as `updateDraft`), validates/swaps the receipt, flips status `rejected → pending`, inserts a new `approvals` row at `position = chain.length + 1` pointing at the submitter's current manager. Prior rejected approval rows (and their `decisionNote`s) are kept untouched — every rejection cycle keeps its own note. Logs `resubmitted` + `status_changed`. Notifies the manager.
- `get` — query. Permission gating: submitter, any approver in chain, or `expenses.read.team`.
- `listMine` — **paginated** query. Args: `paginationOpts` (Convex `paginationOptsValidator`) + filters (`status`, `category`, `fromMs`, `toMs`) + `sortDir`. Picks the most selective index for the active filter and re-applies the rest via `.filter()` (paginate-safe). Returns the standard `{ page, isDone, continueCursor }` envelope.
- `listForTeam` — **paginated** query. Permission: `expenses.read.team`. Same shape as `listMine`.

### `approvals.ts`

All three call `chain.assertCurrentApprover()` and `activity.log()` in-transaction.

- `approve` — mutation. Optional `addNextApproverId` for handoff (backend-only in v1; UI hidden). Terminal: flips expense status to `approved`. Notifies submitter (terminal) or new approver (handoff).
- `reject` — mutation. Required `note`. Flips expense status to `rejected`. Notifies submitter with note.
- `listMyPending` — query. Driven by `by_approver_and_state`.
- `listMyHistory` — query. Driven by `by_approver_and_decided_at`.
- `listMyDashboard` — **paginated** query. Args: `paginationOpts` + `state` + `fromMs`/`toMs` (filtered post-hydration against the expense's `submittedAt`) + `sortDir`. Hydrates expense + submitter on the page slice. Returns `{ page, isDone, continueCursor }`. Note: post-hydration date filtering can yield short pages when the range is narrow.

### `activity.ts`

- `listForSubject` — query. Full log (manager view). Permission: `activity.read.full` OR caller is subject owner.
- `listForOwner` — query. Owner-filtered: `status_changed` events, every `rejected` event (with its `note`), and every `resubmitted` event. Submitters see the full edit-and-resubmit history but never the chain mechanics.

### `notifications.ts`

> **Backend ready, UI deferred.** Mutations across `expenses.ts` / `approvals.ts` already insert `notifications` rows on submit / approve / reject / handoff / resubmit. The query/mutation surface below is fully implemented and tested. The `<NotificationBell>` UI was pulled from v1 and will land in a later release — a future client can wire these without backend changes.

- `listMyUnread` — query. Live, drives the bell.
- `listMine` — query. Read + unread.
- `markRead` — mutation.
- `markAllRead` — mutation.

### `files.ts`

- `generateUploadUrl` — mutation. Caller must be authed.
- `getReceiptUrl` — query. Returns signed URL only when caller is submitter, in-chain approver, or has `expenses.read.team`.

## Auth integration

`@convex-dev/auth` Password provider owns the `users` table via `authTables`. The `auth.ts` module re-exports `auth`, `signIn`, `signOut`, `store`, `isAuthenticated` as required. `getAuthUserId(ctx)` returns the caller's `Id<"users">` directly — there is no separate `tokenIdentifier` mapping table. `auth.config.ts` provides the JWT provider config so `getAuthUserId` works in production.

## Tests

Tests live in `convex/__tests__/` (consolidated, not co-located with the modules they cover). Shared test utilities sit in `convex/__tests__/testHelpers.utils.ts`. They use `convex-test` + Vitest with `environment: "edge-runtime"`. See [`patterns.md`](patterns.md) for the test recipe.

Coverage target: 80% on `convex/lib/*` and the four "load-bearing" function modules (`expenses.ts`, `approvals.ts`, `files.ts`, `auth.ts`).

## Things explicitly NOT to do

- Don't `.filter()` queries — define an index and `.withIndex()`.
- Don't accept `userId` from clients for auth — derive it via `getAuthUserId`.
- Don't store FX rates or perform currency conversion. v1 records `amount` + `currency` only.
- Don't call `ctx.db.system.getMetadata` (deprecated) — use `ctx.db.system.get("_storage", id)`.
- Don't add `"use node";` to any file that exports queries or mutations. Actions go in their own files (or `scripts/seed.ts`).
- Don't trust an index to enforce uniqueness — it doesn't. Throw inside the mutation.

## Known v1 limitations

- **Orphan receipt blobs.** When `expenses.createDraft` / `updateDraft` / `submit` reject an invalid receipt (oversized, wrong MIME), the mutation throws and **does not** delete the orphan blob inline — Convex's transactional rollback would revert any `ctx.storage.delete` made before the throw. Orphans accumulate until a future cron job sweeps `_storage` rows that aren't referenced by any `expenses.receiptStorageId`. This is documented in `expenses.ts:validateReceiptOrThrow`. Per-attempt cap is 10 MB, so storage growth is bounded by how often a given user retries.

## Deploy

`pnpm deploy` is the only sanctioned path to push the backend. It runs in this order:

1. `pnpm lint` — type-check + ESLint.
2. `pnpm test` — full Vitest suite (backend `convex/__tests__/**` in edge-runtime + frontend `src/__tests__/**` in jsdom). A single failure aborts the chain via the npm `predeploy` lifecycle.
3. `convex deploy --cmd 'pnpm build'` — pushes Convex functions and produces the production Vite bundle.

Never call `convex deploy` directly — it skips the test gate. CI should also run `pnpm test` before merging anything that touches `convex/`.
