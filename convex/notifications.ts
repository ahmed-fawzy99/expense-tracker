import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireSameTeam } from "./lib/permissions";

/**
 * The caller's unread notifications, newest first. Drives the navbar bell.
 */
export const listMyUnread = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireAuth(ctx);
    return await ctx.db
      .query("notifications")
      .withIndex("by_user_and_unread", (q) =>
        q.eq("userId", me._id).eq("readAt", null),
      )
      .order("desc")
      .take(50);
  },
});

/**
 * The caller's full notification history (read + unread). Used if/when we
 * surface a "all notifications" dropdown view; v1 bell only shows unread.
 */
export const listMine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
    return await ctx.db
      .query("notifications")
      .withIndex("by_user_and_unread", (q) => q.eq("userId", me._id))
      .order("desc")
      .take(limit);
  },
});

/**
 * Marks a single notification as read.
 */
export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    const notif = await ctx.db.get("notifications", args.notificationId);
    if (!notif) throw new ConvexError("Notification not found");
    requireSameTeam(me, notif.teamId);
    if (notif.userId !== me._id) {
      throw new ConvexError("Forbidden: not your notification");
    }
    if (notif.readAt === null) {
      await ctx.db.patch("notifications", args.notificationId, { readAt: Date.now() });
    }
  },
});

/**
 * Marks all of the caller's unread notifications as read in a single tx.
 */
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireAuth(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_unread", (q) =>
        q.eq("userId", me._id).eq("readAt", null),
      )
      .take(500);
    const now = Date.now();
    for (const n of unread) {
      await ctx.db.patch("notifications", n._id, { readAt: now });
    }
    return unread.length;
  },
});
