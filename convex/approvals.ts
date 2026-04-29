import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  hasPermission,
  PERMISSIONS,
  requireAuth,
  requirePermission,
  requireSameTeam,
} from "./lib/permissions";

const MAX_REJECTION_NOTE_LEN = 2000;
import {
  assertCanAddApprover,
  chainApproverIds,
  getCurrentPendingApproval,
  nextPosition,
} from "./lib/chain";
import { log } from "./lib/activity";

/**
 * Lists the caller's pending approval queue (driven by the
 * `byApproverAndState` index).
 */
export const listMyPending = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireAuth(ctx);
    const rows = await ctx.db
      .query("approvals")
      .withIndex("by_approver_and_state", (q) =>
        q.eq("approverId", me._id).eq("state", "pending"),
      )
      .order("desc")
      .take(500);

    // Hydrate the expense for each row for the manager queue.
    const expenses = await Promise.all(
      rows.map((r) => ctx.db.get("expenses", r.expenseId)),
    );
    return rows.map((r, i) => ({ approval: r, expense: expenses[i] }));
  },
});

/**
 * Combined queue for the manager dashboard: pending + decided steps the
 * caller acted on. Filters by state (pending/approved/rejected/all) and an
 * optional date range. Hydrates the expense and submitter so the table can
 * show the full row in one query.
 */
export const listMyDashboard = query({
  args: {
    paginationOpts: paginationOptsValidator,
    state: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
    ),
    fromMs: v.optional(v.number()),
    toMs: v.optional(v.number()),
    sortDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    const dir = args.sortDir ?? "desc";

    // Pick a `submittedAt`-keyed index so paginated results are globally
    // ordered by submission date. `submittedAt` is denormalized onto the
    // approval row at insert time, which lets us range-filter and sort at
    // the index level here.
    const fromMs = args.fromMs;
    const toMs = args.toMs;
    const indexed =
      args.state !== undefined
        ? ctx.db
            .query("approvals")
            .withIndex("by_approver_and_state_and_submitted_at", (q) => {
              const base = q
                .eq("approverId", me._id)
                .eq("state", args.state!);
              if (fromMs !== undefined && toMs !== undefined) {
                return base
                  .gte("submittedAt", fromMs)
                  .lte("submittedAt", toMs);
              }
              if (fromMs !== undefined) return base.gte("submittedAt", fromMs);
              if (toMs !== undefined) return base.lte("submittedAt", toMs);
              return base;
            })
        : ctx.db
            .query("approvals")
            .withIndex("by_approver_and_submitted_at", (q) => {
              const base = q.eq("approverId", me._id);
              if (fromMs !== undefined && toMs !== undefined) {
                return base
                  .gte("submittedAt", fromMs)
                  .lte("submittedAt", toMs);
              }
              if (fromMs !== undefined) return base.gte("submittedAt", fromMs);
              if (toMs !== undefined) return base.lte("submittedAt", toMs);
              return base;
            });

    const result = await indexed.order(dir).paginate(args.paginationOpts);

    const expenses = await Promise.all(
      result.page.map((r) => ctx.db.get("expenses", r.expenseId)),
    );
    const submitters = await Promise.all(
      expenses.map(async (e) =>
        e ? await ctx.db.get("users", e.submitterId) : null,
      ),
    );

    const hydrated = result.page.map((approval, i) => ({
      approval,
      expense: expenses[i],
      submitter: submitters[i],
    }));

    // Drop any orphaned approvals whose parent expense was deleted. Date
    // range and order are already enforced by the index above.
    const filteredPage = hydrated.filter((entry) => entry.expense !== null);

    return { ...result, page: filteredPage };
  },
});

/**
 * Lists the caller's decided history (approved or rejected by them).
 */
export const listMyHistory = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireAuth(ctx);
    const rows = await ctx.db
      .query("approvals")
      .withIndex("by_approver_and_decided_at", (q) =>
        q.eq("approverId", me._id),
      )
      .order("desc")
      .take(500);
    const decided = rows.filter((r) => r.state !== "pending");
    const expenses = await Promise.all(
      decided.map((r) => ctx.db.get("expenses", r.expenseId)),
    );
    return decided.map((r, i) => ({ approval: r, expense: expenses[i] }));
  },
});

/**
 * Lists all approval rows for an expense (chain view). Caller must be allowed
 * to view the expense.
 */
export const listForExpense = query({
  args: { expenseId: v.id("expenses") },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense) return [];
    requireSameTeam(me, expense.teamId);
    // Visibility: submitter, in-chain approver, or expenses.read.team.
    const isSubmitter = expense.submitterId === me._id;
    const canTeam = await hasPermission(ctx, me, PERMISSIONS.expensesReadTeam);
    const allChain = await ctx.db
      .query("approvals")
      .withIndex("by_expense", (q) => q.eq("expenseId", args.expenseId))
      .collect();
    const wasOrIsApprover = allChain.some((a) => a.approverId === me._id);
    if (!(isSubmitter || canTeam || wasOrIsApprover)) {
      throw new ConvexError("Forbidden: cannot view this expense's chain");
    }
    return allChain.sort((a, b) => a.position - b.position);
  },
});

/**
 * Approves the current pending step on an expense.
 *
 * Optional `addNextApproverId`: hands off to the next approver and inserts
 * the next pending step. Backend supports this for future UI; v1 UI only
 * calls this without `addNextApproverId`.
 */
export const approve = mutation({
  args: {
    expenseId: v.id("expenses"),
    addNextApproverId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    await requirePermission(ctx, me, PERMISSIONS.expensesApprove);

    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense) throw new ConvexError("Expense not found");
    requireSameTeam(me, expense.teamId);

    if (expense.status !== "pending") {
      throw new ConvexError("Only pending expenses can be approved");
    }

    const current = await getCurrentPendingApproval(ctx, args.expenseId);
    if (!current) {
      throw new ConvexError("No pending approval step found");
    }
    if (current.approverId !== me._id) {
      throw new ConvexError("Only the current approver can act on this step");
    }

    // Mark current step approved.
    const decidedAt = Date.now();
    await ctx.db.patch("approvals", current._id, {
      state: "approved",
      decidedAt,
      decisionNote: null,
    });

    if (args.addNextApproverId !== undefined) {
      // Handoff: validate next approver, insert next pending step.
      const candidate = args.addNextApproverId;
      const candidateUser = await ctx.db.get("users", candidate);
      if (!candidateUser) throw new ConvexError("Next approver not found");
      requireSameTeam(me, candidateUser.teamId);

      const canCandidateApprove = await hasPermission(
        ctx,
        candidateUser,
        PERMISSIONS.expensesApprove,
      );
      if (!canCandidateApprove) {
        throw new ConvexError("Selected user cannot approve expenses");
      }

      const existingApproverIds = await chainApproverIds(ctx, args.expenseId);
      assertCanAddApprover({
        candidateId: candidate,
        submitterId: expense.submitterId,
        existingApproverIds,
      });

      const allChain = await ctx.db
        .query("approvals")
        .withIndex("by_expense", (q) => q.eq("expenseId", args.expenseId))
        .collect();
      const newPosition = nextPosition(allChain.length);

      await ctx.db.insert("approvals", {
        expenseId: args.expenseId,
        teamId: expense.teamId,
        position: newPosition,
        approverId: candidate,
        state: "pending",
        // Inherit the parent expense's current submission timestamp so all
        // chain steps within one cycle sort together by submission date.
        submittedAt: expense.submittedAt ?? Date.now(),
        decidedAt: null,
        decisionNote: null,
      });

      await log(ctx, {
        subjectType: "expenses",
        subjectId: args.expenseId,
        teamId: expense.teamId,
        causerId: me._id,
        event: "chain_extended",
        description: `Handed off to next approver`,
        properties: {
          byApproverId: me._id,
          nextApproverId: candidate,
          position: newPosition,
        },
      });
      await log(ctx, {
        subjectType: "expenses",
        subjectId: args.expenseId,
        teamId: expense.teamId,
        causerId: me._id,
        event: "approved",
        description: `Step ${current.position} approved (handed off)`,
        properties: { byApproverId: me._id, position: current.position },
      });

      await ctx.db.insert("notifications", {
        userId: candidate,
        teamId: expense.teamId,
        type: "approval_requested",
        subjectType: "expenses",
        subjectId: args.expenseId,
        message: `An expense was handed off to you for approval`,
        readAt: null,
      });
      // Submitter gets a chain_extended ping (informational).
      await ctx.db.insert("notifications", {
        userId: expense.submitterId,
        teamId: expense.teamId,
        type: "chain_extended",
        subjectType: "expenses",
        subjectId: args.expenseId,
        message: `Your expense was handed off to another approver`,
        readAt: null,
      });
      return { terminal: false };
    }

    // Terminal approval — flip expense status.
    await ctx.db.patch("expenses", args.expenseId, {
      status: "approved",
      decidedAt,
    });

    await log(ctx, {
      subjectType: "expenses",
      subjectId: args.expenseId,
      teamId: expense.teamId,
      causerId: me._id,
      event: "approved",
      description: `Approved`,
      properties: { byApproverId: me._id, position: current.position },
    });
    await log(ctx, {
      subjectType: "expenses",
      subjectId: args.expenseId,
      teamId: expense.teamId,
      causerId: me._id,
      event: "status_changed",
      description: `Status: pending → approved`,
      properties: { from: "pending", to: "approved" },
    });

    await ctx.db.insert("notifications", {
      userId: expense.submitterId,
      teamId: expense.teamId,
      type: "expense_decided",
      subjectType: "expenses",
      subjectId: args.expenseId,
      message: `Your expense was approved`,
      readAt: null,
    });

    return { terminal: true };
  },
});

/**
 * Rejects the current pending step on an expense. Terminal — flips status
 * to rejected, stores the note, notifies the submitter.
 */
export const reject = mutation({
  args: {
    expenseId: v.id("expenses"),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    await requirePermission(ctx, me, PERMISSIONS.expensesApprove);
    const trimmedNote = args.note.trim();
    if (trimmedNote.length === 0) {
      throw new ConvexError("A rejection note is required");
    }
    if (trimmedNote.length > MAX_REJECTION_NOTE_LEN) {
      throw new ConvexError(`Rejection note too long (max ${MAX_REJECTION_NOTE_LEN} chars)`);
    }

    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense) throw new ConvexError("Expense not found");
    requireSameTeam(me, expense.teamId);
    if (expense.status !== "pending") {
      throw new ConvexError("Only pending expenses can be rejected");
    }

    const current = await getCurrentPendingApproval(ctx, args.expenseId);
    if (!current) {
      throw new ConvexError("No pending approval step found");
    }
    if (current.approverId !== me._id) {
      throw new ConvexError("Only the current approver can reject this step");
    }

    const decidedAt = Date.now();
    await ctx.db.patch("approvals", current._id, {
      state: "rejected",
      decidedAt,
      decisionNote: trimmedNote,
    });
    await ctx.db.patch("expenses", args.expenseId, {
      status: "rejected",
      decidedAt,
    });

    // Status change is written first so it appears above the reason in
    // reverse-chronological views (Convex `.order("desc")` falls back to
    // insertion order when two rows share a `_creationTime`).
    await log(ctx, {
      subjectType: "expenses",
      subjectId: args.expenseId,
      teamId: expense.teamId,
      causerId: me._id,
      event: "status_changed",
      description: `Status: pending → rejected`,
      properties: { from: "pending", to: "rejected" },
    });
    await log(ctx, {
      subjectType: "expenses",
      subjectId: args.expenseId,
      teamId: expense.teamId,
      causerId: me._id,
      event: "rejected",
      description: `Rejected: ${trimmedNote}`,
      properties: {
        byApproverId: me._id,
        position: current.position,
        note: trimmedNote,
      },
    });

    await ctx.db.insert("notifications", {
      userId: expense.submitterId,
      teamId: expense.teamId,
      type: "expense_decided",
      subjectType: "expenses",
      subjectId: args.expenseId,
      message: `Your expense was rejected: ${trimmedNote}`,
      readAt: null,
    });
  },
});

/**
 * Convenience: returns hydrated approver info for a list of approval rows.
 * Used by the chain panel to show approver names.
 */
export const hydrateApprovers = query({
  args: { expenseId: v.id("expenses") },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense) return [];
    requireSameTeam(me, expense.teamId);
    const chain = await ctx.db
      .query("approvals")
      .withIndex("by_expense", (q) => q.eq("expenseId", args.expenseId))
      .collect();
    const approvers = await Promise.all(
      chain.map((a) => ctx.db.get("users", a.approverId)),
    );
    return chain.map((a, i) => {
      const u = approvers[i];
      return {
        approval: a,
        approver: u
          ? { _id: u._id, name: u.name ?? null, email: u.email ?? null }
          : null,
      };
    });
  },
});

// Re-export the Id type so dependent files can `import type { Id }` here.
export type ApprovalsId = Id<"approvals">;
