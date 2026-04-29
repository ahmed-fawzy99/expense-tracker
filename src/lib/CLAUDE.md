# `src/lib/` — Client-only utilities

## What lives here

- `utils.ts` — shadcn `cn()` helper (existing).
- `route-guards.tsx` — `<RequireAuth>`, `<RequirePermission>` (in-place 403, never redirect).
- `format.ts` — `formatMoney(minor, currency)`, `formatDate(ts)`, role/category formatters.
- `status.ts` — status enum + display tokens.
- Any other client-only helper without DOM ownership.

## Belongs here

- Pure functions consumed by components/hooks.
- Tiny React wrappers (route guards) that have no significant rendering logic of their own.

## Does NOT belong here

- Business logic — that's the server's job.
- Convex calls — those go in `hooks/` or directly in components.
- Anything that requires Node built-ins.

## Refactor signal

A `lib/` file > ~200 lines almost always wants to be split by topic.
