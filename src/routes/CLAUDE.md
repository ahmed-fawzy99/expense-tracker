# `src/routes/` — File-based routes (TanStack Router)

## What lives here

Pages, grouped by audience role. The TanStack Router plugin generates `routeTree.gen.ts` from this folder.

## Folders

| Folder        | Purpose                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| `auth/`       | Unauthenticated routes (only `login` in v1)                              |
| `expense/`    | Per-expense routes — single `$expenseId.tsx` serves owners and approvers |
| `expenses/`   | Manager dashboard — pending + history with filters                       |
| `account/`    | Self-service (email + password)                                          |
| (root files)  | `index.tsx` (My Expenses), `new.tsx` (create expense)                    |

## Hard rules

1. **No redirect anti-pattern.** A page that requires a permission wraps its content in `<RequirePermission>`. The 403 panel renders in place — same URL, no bounce.
2. **Audience separation is presentational, not authoritative.** A manager visiting `/employee` works fine — the content gates itself. A user who lacks `expenses.approve` visiting `/manager` sees `<ForbiddenPanel>`.
3. Route components are thin: they assemble layout + components, never own business logic.
4. Each route file: `Route` export + a single `Component`. If a page grows past ~150 lines, extract its body into a component under `src/components/`.

## Adding a route

1. Create the file. The router plugin regenerates `routeTree.gen.ts` automatically during `pnpm dev`.
2. Wrap the body in the right guards.
3. Add a nav entry in `AppShell.tsx` if the route is meant to be discoverable.
4. Document the route in `docs/frontend/FRONTEND.md`.
