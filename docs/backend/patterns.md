# Backend — Patterns Cookbook

Mandatory recipes. If you can't fit your code into these patterns, talk to the codebase first — chances are the helper you need already exists in `convex/lib/`.

## 1. Every function starts with the guard sandwich

```ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireSameTeam, requirePermission } from "./lib/permissions";

export const doThing = mutation({
  args: { expenseId: v.id("expenses") },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found");
    requireSameTeam(me, expense.teamId);
    await requirePermission(ctx, me, "expenses.approve");
    // ... business logic
  },
});
```

- **`requireAuth`** throws on unauthed callers. Never skip it, even on read-only queries.
- **`requireSameTeam`** is mandatory whenever you touch a row that carries a `teamId`.
- **`requirePermission`** is preferred over checking role names. Adding a future role becomes a seed entry — write `permissionNames` on the new `roles` row (consumed by `permissionsFor`) **and** the matching `rolePermissions` rows (consumed by `chain.ts`'s reverse lookup). Roles/permissions are seed-only and write-once; the two stores are kept in sync at seed time.

## 2. Every state-changing mutation logs activity in-transaction

```ts
import { log } from "./lib/activity";

await ctx.db.patch(expenseId, { status: "approved" });
await log(ctx, {
  subjectType: "expenses",
  subjectId: expenseId,
  causerId: me._id,
  event: "status_changed",
  description: `Status changed to approved`,
  properties: { from: "pending", to: "approved" },
});
```

The `log()` helper enforces typed `event` per `subjectType`. If your event isn't in the union, **add it to the union first** — don't bypass.

## 3. Always use indexes — never `.filter()`

```ts
// CORRECT
await ctx.db
  .query("expenses")
  .withIndex("by_team_and_status", (q) => q.eq("teamId", me.teamId).eq("status", "pending"))
  .take(50);

// WRONG (no index)
await ctx.db.query("expenses").filter((q) => q.eq(q.field("teamId"), me.teamId)).collect();
```

Index naming is **snake_case** (Convex's official guideline): `by_team_and_status`. Document fields remain camelCase (`teamId`, `submittedAt`). Bake every queried-column combo into a dedicated index — index lookups are the only fast path.

## 4. Bounded reads only

`.collect()` is forbidden in production paths unless you've already narrowed via an index AND the result set is bounded by domain (e.g., "all chain steps for one expense" — that's bounded). For paginated reads, use `paginationOptsValidator`. For unbounded "list latest N", use `.take(n)`.

## 5. App-enforced uniqueness

Convex indexes are **not unique**. Enforce uniqueness inside the create mutation:

```ts
const existing = await ctx.db
  .query("permissions")
  .withIndex("byName", (q) => q.eq("name", args.name))
  .unique();
if (existing) throw new Error(`Permission ${args.name} already exists`);
await ctx.db.insert("permissions", { name: args.name, description: args.description ?? null });
```

For `users.email`, Convex Auth handles uniqueness inside `createAccount` — you inherit it.

## 6. Receipt validation belongs in the binding mutation, not in upload

`files.generateUploadUrl` cannot validate MIME or size. So `expenses.attachReceipt` (or `expenses.submit`) reads `_storage` metadata, validates, and on failure throws AND deletes the orphan:

```ts
const meta = await ctx.db.system.get("_storage", storageId);
if (!meta) throw new Error("Receipt not found");
const allowed = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
if (!meta.contentType || !allowed.includes(meta.contentType) || meta.size > 10 * 1024 * 1024) {
  await ctx.storage.delete(storageId);
  throw new Error("Receipt must be PNG/JPEG/WEBP/PDF and ≤ 10 MB");
}
```

## 7. Polymorphic activity log: typed unions, not bare strings

The `activityLog` table is a `v.union` of typed variants — `subjectType` literal + `subjectId: v.id("expenses" | "users" | …)`. Never insert a bare string for `subjectType` or a generic `string` for `subjectId`. Always go through `log()`, which narrows `properties` per event variant.

## 8. Notifications are emitted server-side from the same mutation

Don't push notifications from the client. Inside `submit`, `approve`, `reject`, the same mutation that changes state inserts the `notifications` row(s). The client subscribes via a live `useQuery` and reflects changes automatically.

## 9. Cross-runtime split

- Files exporting **queries or mutations** stay in the default runtime — no `"use node";`.
- Files exporting **actions that need Node built-ins** (e.g., `scripts/seed.ts`) start with `"use node";`.
- Never mix.

## 10. Test recipe

All tests live in `convex/__tests__/`, separate from the modules they cover. Shared test utilities (`testHelpers.utils.ts`) live in the same folder. Because the test file sits one level deep, imports use `../` and the convex-test glob spans the whole `convex/` tree:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

describe("expenses.submit", () => {
  test("transitions draft → pending and inserts approvals[1]", async () => {
    const t = convexTest(schema, modules);
    // ... arrange via internal seed mutations, act via t.mutation, assert via t.query
  });
});
```

Each test sets up its world with **internal** test-only seeders (separate file, not exported in the public API). Run with `pnpm vitest run`.

## 11. Type strictness

- Use `Id<"table">` for all FKs — never `string`.
- Use `Doc<"table">` for full row types.
- `QueryCtx`, `MutationCtx`, `ActionCtx` for context types — never `any`.
- The only acceptable `v.any()` usage is in the activity log's `properties` escape hatch, and `log()` narrows it via per-event TS unions in the helper.

## 12. Permission-driven, not role-name-driven

Eligibility checks (e.g., "can this user appear as approver?") look up the **permission**, not the role name. The forward-resolution algorithm in `convex/lib/chain.ts` walks `permissions.byName → rolePermissions.byPermission → userRoles.byRoleAndTeam`. This is what makes the system extensible to future roles (`finance`, `senior_manager`) without touching `chain.ts`.
