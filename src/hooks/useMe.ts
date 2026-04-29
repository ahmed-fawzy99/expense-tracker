import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * Returns the authenticated caller's profile + permission set.
 *
 * Tri-state semantics:
 *   - `undefined` — query is in flight (loading)
 *   - `null`      — caller is not authenticated
 *   - `{ user, permissions }` — caller is authenticated
 *
 * Components should branch on these explicitly (see `<RequireAuth>` for the
 * pattern). Never assume the result is defined.
 */
export function useMe() {
  return useQuery(api.auth.getMe);
}

export type Me = NonNullable<ReturnType<typeof useMe>>;
