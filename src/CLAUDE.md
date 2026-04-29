# `src/` — React (Vite) client

## What lives here

The entire client. Talks to Convex via `useQuery` / `useMutation` from `convex/react` and `useAuthActions` from `@convex-dev/auth/react`. Auth lives **server-side**; the client only gates the UI.

## Layout

| Folder           | Owns                                                              |
| ---------------- | ----------------------------------------------------------------- |
| `routes/`        | File-based TanStack Router pages, grouped by audience role        |
| `components/`    | Presentational + feature-level shared components                  |
| `components/ui/` | shadcn primitives (rarely edited — re-pull instead)               |
| `hooks/`         | Thin wrappers over Convex hooks (`useMe`, `useMyPermissions`)     |
| `lib/`           | Client-only utilities — formatting, route guards, status mapping  |

## Provider tree

```tsx
<ConvexAuthProvider client={convex}>
  <RouterProvider router={router} />
</ConvexAuthProvider>
```

`<Toaster />` (shadcn `sonner`) is mounted inside `__root.tsx`.

## Hard rules

1. **Never attempt to navigate to a route the user can't access.** If the server would deny it, render `<ForbiddenPanel>` in place. The address bar stays unchanged.
2. **The server is the authority.** Client gating is for UX; mutations still throw if a user crafts a forbidden request.
3. **No business logic in components.** Validation goes in zod schemas; permission decisions go through `useMyPermissions()`; data flow goes through `useQuery`/`useMutation`.
4. **No raw `<input>` once a form exists.** Use shadcn `<Form>` primitives.

## Tests

Frontend tests live in `src/__tests__/`, organized by source area (`lib/`, `hooks/`, `components/`, `routes/`). Helpers and fixtures live in `src/__tests__/_helpers/`. Co-located `*.test.tsx` next to source files is **not** allowed — keep all tests in the dedicated folder.

Vitest runs two projects from one config (see `vitest.config.ts`):

- `backend` — `convex/__tests__/**/*.test.ts` in `edge-runtime`.
- `frontend` — `src/__tests__/**/*.test.{ts,tsx}` in `jsdom`.

Convex hooks (`useQuery`, `useMutation`, `useAction`) are mocked via `src/__tests__/_helpers/mockConvex.ts`; TanStack Router is mocked via `src/__tests__/_helpers/mockRouter.tsx`. See `docs/frontend/patterns.md` §Testing for the recipe.

Commands: `pnpm test:frontend`, `pnpm test:backend`, `pnpm test` (both).
