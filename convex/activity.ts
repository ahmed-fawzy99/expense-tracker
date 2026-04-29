import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import {
  hasPermission,
  PERMISSIONS,
  requireAuth,
  requireSameTeam,
} from "./lib/permissions";

const subjectTypeValidator = v.union(
  v.literal("expenses"),
  v.literal("users"),
);

/**
 * Full activity log for a subject. Permission: `activity.read.full` OR the
 * caller is the subject's "owner" (e.g., expense submitter).
 *
 * Used by the manager-side <ActivityLog>.
 */
export const listForSubject = query({
  args: {
    subjectType: subjectTypeValidator,
    subjectId: v.union(v.id("expenses"), v.id("users")),
  },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);

    let isOwner = false;
    if (args.subjectType === "expenses") {
      const expense = await ctx.db.get("expenses", args.subjectId as import("./_generated/dataModel").Id<"expenses">);
      if (!expense) return [];
      requireSameTeam(me, expense.teamId);
      isOwner = expense.submitterId === me._id;
    } else {
      const user = await ctx.db.get("users", args.subjectId as import("./_generated/dataModel").Id<"users">);
      if (!user) return [];
      requireSameTeam(me, user.teamId);
      isOwner = user._id === me._id;
    }

    const canFull = await hasPermission(ctx, me, PERMISSIONS.activityReadFull);
    if (!isOwner && !canFull) {
      // Non-owner without read.full perm — for expenses, also allow if caller
      // is in the approval chain. For users, owner-or-full is the only path.
      let wasOrIsApprover = false;
      if (args.subjectType === "expenses") {
        const inChain = await ctx.db
          .query("approvals")
          .withIndex("by_expense", (q) =>
            q.eq("expenseId", args.subjectId as import("./_generated/dataModel").Id<"expenses">),
          )
          .collect();
        wasOrIsApprover = inChain.some((a) => a.approverId === me._id);
      }
      if (!wasOrIsApprover) {
        throw new ConvexError("Forbidden: cannot read this activity log");
      }
    }

    const rows = await ctx.db
      .query("activityLog")
      .withIndex("by_subject", (q) =>
        q
          .eq("subjectType", args.subjectType)
          .eq("subjectId", args.subjectId),
      )
      .order("desc")
      .take(500);

    return rows;
  },
});

/**
 * Owner-filtered activity log. For expenses, returns only `status_changed`
 * events plus the rejection note (the most recent `rejected` event), so
 * submitters never see the chain mechanics.
 */
export const listForOwner = query({
  args: {
    subjectType: v.literal("expenses"),
    subjectId: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    const expense = await ctx.db.get("expenses", args.subjectId);
    if (!expense) return [];
    requireSameTeam(me, expense.teamId);
    if (expense.submitterId !== me._id) {
      throw new ConvexError("Forbidden: only the submitter can view their own log");
    }

    const rows = await ctx.db
      .query("activityLog")
      .withIndex("by_subject", (q) =>
        q
          .eq("subjectType", "expenses")
          .eq("subjectId", args.subjectId),
      )
      .order("desc")
      .take(500);

    return rows.filter((r) => {
      // Only show: status changes + the final reject (which carries the note).
      if (r.subjectType !== "expenses") return false;
      if (r.event === "status_changed") return true;
      if (r.event === "rejected") return true;
      if (r.event === "resubmitted") return true;
      return false;
    });
  },
});

/**
 * Team-wide audit. Permission: `activity.read.full`.
 */
export const listForTeam = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    const canFull = await hasPermission(ctx, me, PERMISSIONS.activityReadFull);
    if (!canFull) {
      throw new ConvexError(`Forbidden: missing permission ${PERMISSIONS.activityReadFull}`);
    }
    return await ctx.db
      .query("activityLog")
      .withIndex("by_team_and_created", (q) => q.eq("teamId", me.teamId))
      .order("desc")
      .take(args.limit ?? 200);
  },
});
