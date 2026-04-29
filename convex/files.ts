import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  hasPermission,
  PERMISSIONS,
  requireAuth,
  requireSameTeam,
} from "./lib/permissions";

/**
 * Issues a one-shot signed upload URL. The actual file binding (and
 * MIME/size validation) happens in `expenses.attachReceipt` / `expenses.submit`.
 * The upload URL itself does NOT validate.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Returns a signed URL for the receipt of an expense, gated by viewer rules:
 *   - submitter
 *   - any approver currently or previously in the chain
 *   - holds `expenses.read.team`
 */
export const getReceiptUrl = query({
  args: { expenseId: v.id("expenses") },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense) return null;
    requireSameTeam(me, expense.teamId);

    if (expense.receiptStorageId === null) return null;

    const isSubmitter = expense.submitterId === me._id;
    const canTeam = await hasPermission(ctx, me, PERMISSIONS.expensesReadTeam);
    let inChain = false;
    if (!isSubmitter && !canTeam) {
      const chain = await ctx.db
        .query("approvals")
        .withIndex("by_expense", (q) => q.eq("expenseId", args.expenseId))
        .collect();
      inChain = chain.some((a) => a.approverId === me._id);
    }
    if (!isSubmitter && !canTeam && !inChain) {
      throw new ConvexError("Forbidden: you cannot view this receipt");
    }

    return await ctx.storage.getUrl(expense.receiptStorageId);
  },
});
