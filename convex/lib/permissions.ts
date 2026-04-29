import { ConvexError } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ROLES, type PermissionName, type RoleName } from "./authConstants";

// Re-export the constants so server modules can import them from this file
// (the historical home of permission helpers).
export {
  PERMISSIONS,
  ROLES,
  ALL_PERMISSION_NAMES,
  ALL_ROLE_NAMES,
} from "./authConstants";
export type { PermissionName, RoleName } from "./authConstants";

const ADMIN_ROLE_NAME: RoleName = ROLES.admin;

/**
 * Resolves the authenticated caller's `users` row. Throws if unauthenticated
 * or if the auth identity has no matching user row (i.e. the row was deleted).
 */
export async function requireAuth(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Unauthenticated");
  }
  const user = await ctx.db.get("users", userId);
  if (!user) {
    throw new ConvexError("Unauthenticated");
  }
  return user;
}

/**
 * Asserts the caller's team matches the target team. Cross-team access is
 * never allowed in v1.
 */
export function requireSameTeam(
  caller: Doc<"users">,
  targetTeamId: Id<"teams">,
): void {
  if (caller.teamId !== targetTeamId) {
    throw new ConvexError("Forbidden: cross-team access");
  }
}

/**
 * Resolves the caller's effective permission set.
 * - If the caller holds the `admin` role, returns ALL permissions (shortcut).
 * - Otherwise returns the union of permissions across the caller's roles.
 */
export async function permissionsFor(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
): Promise<Set<string>> {
  const memberships = await ctx.db
    .query("userRoles")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .take(50);

  if (memberships.length === 0) {
    return new Set();
  }

  const roleDocs = await Promise.all(
    memberships.map((m) => ctx.db.get("roles", m.roleId)),
  );
  const isAdmin = roleDocs.some(
    (r): r is Doc<"roles"> => r !== null && r.name === ADMIN_ROLE_NAME,
  );

  if (isAdmin) {
    const allPerms = await ctx.db.query("permissions").take(500);
    return new Set(allPerms.map((p) => p.name));
  }

  const out = new Set<string>();
  for (const role of roleDocs) {
    if (!role) continue;
    for (const name of role.permissionNames) {
      out.add(name);
    }
  }
  return out;
}

/**
 * Throws if the caller lacks the named permission.
 */
export async function requirePermission(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  permission: PermissionName,
): Promise<void> {
  const perms = await permissionsFor(ctx, user);
  if (!perms.has(permission)) {
    throw new ConvexError(`Forbidden: missing permission ${permission}`);
  }
}

/**
 * Convenience: returns true/false instead of throwing.
 */
export async function hasPermission(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  permission: PermissionName,
): Promise<boolean> {
  const perms = await permissionsFor(ctx, user);
  return perms.has(permission);
}
