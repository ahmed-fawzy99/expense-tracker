import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  PERMISSIONS,
  requireAuth,
  requirePermission,
  requireSameTeam,
} from "./lib/permissions";

/**
 * Returns the caller's team. Used by AppShell to show team name in the navbar.
 */
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireAuth(ctx);
    const team = await ctx.db.get("teams", me.teamId);
    if (!team) {
      throw new ConvexError("Caller's team is missing");
    }
    return team;
  },
});

/**
 * Updates the caller's team profile (name / defaultCurrency).
 * Permission: `team.manage` (admin only by default).
 */
export const update = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.optional(v.string()),
    defaultCurrency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    const team = await ctx.db.get("teams", args.teamId);
    if (!team) {
      throw new ConvexError("Team not found");
    }
    requireSameTeam(me, team._id);
    await requirePermission(ctx, me, PERMISSIONS.teamManage);

    const patch: Partial<{ name: string; defaultCurrency: string }> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.defaultCurrency !== undefined) {
      patch.defaultCurrency = args.defaultCurrency.toUpperCase();
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch("teams", args.teamId, patch);
    }
    return await ctx.db.get("teams", args.teamId);
  },
});
