import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  PERMISSIONS,
  requireAuth,
  requirePermission,
  requireSameTeam,
} from "./lib/permissions";
import { log } from "./lib/activity";

/**
 * Lists all global role definitions (admin / manager / employee + any future
 * roles seeded by ops). Permission: `users.manage` — used by future admin UI.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireAuth(ctx);
    await requirePermission(ctx, me, PERMISSIONS.usersManage);
    return await ctx.db.query("roles").take(100);
  },
});

/**
 * Lists role assignments for a target user (in the caller's team).
 */
export const listAssignmentsForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    const target = await ctx.db.get("users", args.userId);
    if (!target) throw new ConvexError("User not found");
    requireSameTeam(me, target.teamId);
    await requirePermission(ctx, me, PERMISSIONS.usersManage);

    const memberships = await ctx.db
      .query("userRoles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(100);

    const roles = await Promise.all(
      memberships.map((m) => ctx.db.get("roles", m.roleId)),
    );
    return memberships.map((m, i) => ({
      assignment: m,
      role: roles[i],
    }));
  },
});

/**
 * Assigns a role to a user within the caller's team.
 * Permission: `users.manage`. App-enforces uniqueness on (userId, roleId, teamId).
 */
export const assignToUser = mutation({
  args: {
    userId: v.id("users"),
    roleId: v.id("roles"),
  },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    await requirePermission(ctx, me, PERMISSIONS.usersManage);

    const target = await ctx.db.get("users", args.userId);
    if (!target) throw new ConvexError("Target user not found");
    requireSameTeam(me, target.teamId);

    const role = await ctx.db.get("roles", args.roleId);
    if (!role) throw new ConvexError("Role not found");

    const existing = await ctx.db
      .query("userRoles")
      .withIndex("by_user_and_role_and_team", (q) =>
        q
          .eq("userId", args.userId)
          .eq("roleId", args.roleId)
          .eq("teamId", target.teamId),
      )
      .unique();
    if (existing) {
      return existing._id;
    }

    const id = await ctx.db.insert("userRoles", {
      userId: args.userId,
      roleId: args.roleId,
      teamId: target.teamId,
      assignedBy: me._id,
      assignedAt: Date.now(),
    });

    await log(ctx, {
      subjectType: "users",
      subjectId: args.userId,
      teamId: target.teamId,
      causerId: me._id,
      event: "role.assigned",
      description: `Assigned role "${role.name}"`,
      properties: { roleId: role._id, roleName: role.name },
    });

    return id;
  },
});
