# `convex/lib/` — Shared server-only helpers

## What lives here

Cross-cutting helpers that every Convex function pulls from. These files have **no public API surface** — they aren't registered as queries/mutations/actions; they're just plain TypeScript modules.

| File              | Owns                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| `permissions.ts`  | `requireAuth`, `requireSameTeam`, `requirePermission`, `permissionsFor`                 |
| `chain.ts`        | `eligibleApprovers`, `assertCurrentApprover`, chain duplicate guard                     |
| `activity.ts`     | `log()` — single insertion point for every `activityLog` row, with per-event property types |

## Belongs here

- Pure TypeScript modules importing from `./_generated/server`, `./_generated/dataModel`, or `convex/values`.
- Helpers that need typed `Id<"...">` and `Doc<"...">` — never `string`.

## Does NOT belong here

- Functions registered as `query`, `mutation`, or `action`.
- Domain code (e.g., chain *advancement* with side effects belongs in `convex/approvals.ts`; chain *eligibility* lookup belongs here because it's reused by multiple call sites).
- Anything client-facing.

## Adding a helper

Before writing a new helper, search `lib/*` for an existing one. If a helper would only be used in one module, inline it there — don't pre-extract.
