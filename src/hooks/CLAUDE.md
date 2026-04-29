# `src/hooks/` — Thin Convex wrappers + shared client-side hooks

## What lives here

- `useMe.ts` — wraps `useQuery(api.auth.getMe)`. Returns `{ user, permissions } | null | undefined` (loading is `undefined`).
- `useMyPermissions.ts` — derived from `useMe`. Returns a `(perm: string) => boolean` predicate.
- Future: any hook that's used by ≥2 components and centralizes Convex calls or derived state.

## Belongs here

- Custom hooks (function name starts with `use`).
- Hooks that compose Convex calls or shared state.

## Does NOT belong here

- One-off `useState` / `useEffect` blocks — those stay in the component.
- Server-side logic — that's in `convex/`.

## Refactor signal

If you see the same `useQuery(api.X)` call pattern in 2+ components, that's the moment to extract a hook here.
