import { ConvexError } from "convex/values";
import { MutationCtx } from "../_generated/server";

/**
 * Lightweight per-key sliding-window rate limiter, persisted in `rateLimits`.
 *
 * Each key tracks (windowStartMs, count). On call:
 *   - if the stored window has expired, reset window and count to 1.
 *   - if the count exceeds the limit within the window, throw.
 *   - otherwise, increment the count.
 *
 * Must be called inside a mutation transaction so the read-modify-write is
 * atomic on the row.
 */
export async function enforceRateLimit(
  ctx: MutationCtx,
  args: { key: string; windowMs: number; max: number },
): Promise<void> {
  const now = Date.now();
  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", args.key))
    .unique();

  if (!existing) {
    await ctx.db.insert("rateLimits", {
      key: args.key,
      windowStartMs: now,
      count: 1,
    });
    return;
  }

  const windowExpired = now - existing.windowStartMs >= args.windowMs;
  if (windowExpired) {
    await ctx.db.patch("rateLimits", existing._id, { windowStartMs: now, count: 1 });
    return;
  }

  if (existing.count >= args.max) {
    throw new ConvexError("Too many attempts — please slow down and try again later");
  }
  await ctx.db.patch("rateLimits", existing._id, { count: existing.count + 1 });
}
