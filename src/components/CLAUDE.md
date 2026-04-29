# `src/components/` — Presentational + feature components

## What lives here

- `ui/` — shadcn primitives. Pulled via `pnpm dlx shadcn@latest add <name>`. Don't edit these except for truly unavoidable theme-level changes; re-pull whenever shadcn updates them.
- `layout/` — page chrome: `AppShell`, `PageHeader` etc.
- Feature-level shared components: `ExpenseForm`, `DataTable`, `ApprovalDialog`, `ActivityLog`, `ReceiptUploader`, `StatusBadge`, `ForbiddenPanel`.

## Belongs here

- Components used by ≥2 routes.
- Components used by 1 route but with isolated, presentational responsibility (so the route file stays thin).

## Does NOT belong here

- Components owned by a single route with no extraction value — keep them inline in the route file until they earn extraction.
- Convex calls inside "dumb" presentational components. Data fetches stay in route files (or in custom hooks); presentational components receive props.

## Refactor signal

A component file > ~250 lines is a smell. Split: extract sub-components, extract hooks for repeated `useQuery` patterns, extract helpers for common formatting/predicate logic.
