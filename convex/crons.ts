import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000; // 1 day
const SWEEP_BATCH = 200;

/**
 * Deletes `_storage` blobs older than the grace window that no expense row
 * references via `receiptStorageId`. Failed-upload orphans accumulate when a
 * mutation throws after the blob was uploaded — Convex rolls back the
 * binding insert but the blob itself stays in `_storage`.
 */
export const sweepOrphanReceipts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - ORPHAN_GRACE_MS;
    const blobs = await ctx.db.system
      .query("_storage")
      .order("asc")
      .take(SWEEP_BATCH);

    let deleted = 0;
    for (const blob of blobs) {
      if (blob._creationTime > cutoff) continue;
      // Cheap reverse-lookup: at v1 scale (no team has millions of expenses)
      // a per-blob filter is acceptable. Replace with a denormalized lookup
      // table if scan cost becomes a concern.
      const referenced = await ctx.db
        .query("expenses")
        .filter((q) => q.eq(q.field("receiptStorageId"), blob._id))
        .first();
      if (referenced) continue;
      await ctx.storage.delete(blob._id);
      deleted++;
    }
    return { scanned: blobs.length, deleted };
  },
});

const crons = cronJobs();
crons.daily(
  "sweep orphan receipt blobs",
  { hourUTC: 3, minuteUTC: 0 },
  internal.crons.sweepOrphanReceipts,
);

export default crons;
