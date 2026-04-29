import { useMe } from "./useMe";
import type { PermissionName } from "../../convex/lib/authConstants";

/**
 * Returns a `(permission: PermissionName) => boolean` predicate. Returns
 * `false` for everything while the underlying query is loading — the server
 * is the authority, so a temporary "no" on the client is always safe.
 */
export function useMyPermissions(): {
  ready: boolean;
  has: (permission: PermissionName) => boolean;
} {
  const me = useMe();
  const ready = me !== undefined;
  const set = me ? new Set<string>(me.permissions) : new Set<string>();
  return {
    ready,
    has: (permission: PermissionName) => set.has(permission),
  };
}
