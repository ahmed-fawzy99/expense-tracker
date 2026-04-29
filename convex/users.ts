import { ConvexError, v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { createAccount } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";
import {
  PERMISSIONS,
  requireAuth,
  requirePermission,
  requireSameTeam,
} from "./lib/permissions";

/**
 * Lists users in the caller's team. Permission: `users.manage`.
 */
export const listForTeam = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireAuth(ctx);
    await requirePermission(ctx, me, PERMISSIONS.usersManage);
    return await ctx.db
      .query("users")
      .withIndex("by_team", (q) => q.eq("teamId", me.teamId))
      .take(500);
  },
});

/**
 * Returns a single user by id, scoped to the caller's team.
 */
export const get = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    const user = await ctx.db.get("users", args.userId);
    if (!user) return null;
    if (user.teamId !== me.teamId) return null;
    return {
      _id: user._id,
      name: user.name ?? null,
      email: user.email ?? null,
      teamId: user.teamId,
    };
  },
});

/**
 * Lists users in the caller's team who can act as approvers (have
 * `expenses.approve` via any role). Used for the future handoff UI.
 */
export const listEligibleApproversInTeam = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireAuth(ctx);
    const perm = await ctx.db
      .query("permissions")
      .withIndex("by_name", (q) => q.eq("name", PERMISSIONS.expensesApprove))
      .unique();
    if (!perm) return [];
    const rolePerms = await ctx.db
      .query("rolePermissions")
      .withIndex("by_permission", (q) => q.eq("permissionId", perm._id))
      .take(500);
    const userIds = new Set<Id<"users">>();
    for (const rp of rolePerms) {
      const memberships = await ctx.db
        .query("userRoles")
        .withIndex("by_role_and_team", (q) =>
          q.eq("roleId", rp.roleId).eq("teamId", me.teamId),
        )
        .take(500);
      for (const m of memberships) userIds.add(m.userId);
    }
    const users = await Promise.all([...userIds].map((id) => ctx.db.get("users", id)));
    return users.filter((u) => u !== null);
  },
});

/**
 * Sets a user's direct manager. Permission: `users.manage`.
 */
export const setManager = mutation({
  args: {
    userId: v.id("users"),
    managerId: v.union(v.id("users"), v.null()),
  },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    await requirePermission(ctx, me, PERMISSIONS.usersManage);

    const target = await ctx.db.get("users", args.userId);
    if (!target) throw new ConvexError("User not found");
    requireSameTeam(me, target.teamId);

    if (args.managerId !== null) {
      if (args.managerId === args.userId) {
        throw new ConvexError("A user cannot be their own manager");
      }
      const manager = await ctx.db.get("users", args.managerId);
      if (!manager) throw new ConvexError("Manager not found");
      requireSameTeam(me, manager.teamId);
    }

    await ctx.db.patch("users", args.userId, { managerId: args.managerId });
    return await ctx.db.get("users", args.userId);
  },
});

// ---------------------------------------------------------------------
// Internal helpers (used by `convex/seed.ts` and any future admin action)
// `createAccount` from @convex-dev/auth requires an ActionCtx — that's why
// the user-creation entry point is an action that delegates db work to
// internal queries / mutations.
// ---------------------------------------------------------------------

export const _findIdByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const u = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();
    return u?._id ?? null;
  },
});

/**
 * Creates a user via Convex Auth. Idempotent on email — if a user already
 * exists with the given email, returns its id without re-inserting.
 *
 * The full `profile` is provided to satisfy the schema (teamId is required).
 */
export const createUserInternal = internalAction({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
    teamId: v.id("teams"),
    managerId: v.union(v.id("users"), v.null()),
    createdBy: v.union(v.id("users"), v.null()),
  },
  handler: async (ctx, args): Promise<Id<"users">> => {
    const existing: Id<"users"> | null = await ctx.runQuery(
      internal.users._findIdByEmail,
      { email: args.email },
    );
    if (existing) return existing;

    const result = await createAccount(ctx, {
      provider: "password",
      account: { id: args.email, secret: args.password },
      profile: {
        email: args.email,
        name: args.name,
        teamId: args.teamId,
        managerId: args.managerId,
        createdBy: args.createdBy,
      },
      shouldLinkViaEmail: false,
    });
    return result.user._id;
  },
});

export const setManagerInternal = internalMutation({
  args: {
    userId: v.id("users"),
    managerId: v.union(v.id("users"), v.null()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("users", args.userId, { managerId: args.managerId });
  },
});
