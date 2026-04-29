# `convex/` — Server-side Convex functions + schema

## What lives here

Server functions (queries, mutations, actions), the Convex schema, and `@convex-dev/auth` wiring. Auth/team/permission guards live in `lib/permissions.ts` and are called from every function.

## Belongs here

- `*.ts` files exporting `query`, `mutation`, `internalQuery`, `internalMutation`, or `action` (actions only when no q/m exports). These live at the root of `convex/` because Convex uses file-based routing — moving them changes API paths.
- Pure server-side helpers in `lib/` (the Convex-recommended `convex/model/` pattern; helpers stay free of `query`/`mutation` wrappers).
- Tests in `__tests__/` (all `*.test.ts` plus shared test utilities). Mirrors the frontend convention at `src/__tests__/`.

## Does NOT belong here

- React components — those live in `src/components/`.
- Client-only utilities — those live in `src/lib/`.
- Files mixing `"use node";` actions with queries/mutations — split them.
- `console.log` in production paths — use Convex logging via thrown errors.

## Naming convention (house-style override)

Document **fields** are **camelCase** (e.g., `teamId`, `submittedAt`). Index **names** are **snake_case** (e.g., `by_team_and_status`), per Convex's official guideline in `_generated/ai/guidelines.md`. Don't mix styles.

## Function structure (always)

```ts
handler: async (ctx, args) => {
  const me = await requireAuth(ctx);
  // ...
  requireSameTeam(me, target.teamId);
  await requirePermission(ctx, me, "...");
  // business logic
  await log(ctx, { ... });   // for state-changing mutations
}
```

If you skip any of those steps, you've created a security hole.

## Tests

`pnpm vitest run`. Tests use `convex-test` + Vitest's `edge-runtime` environment. See `docs/backend/patterns.md` §10.
