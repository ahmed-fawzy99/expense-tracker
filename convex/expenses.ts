import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import {
  hasPermission,
  PERMISSIONS,
  requireAuth,
  requirePermission,
  requireSameTeam,
} from "./lib/permissions";
import { log } from "./lib/activity";
import { enforceRateLimit } from "./lib/rateLimit";
import { nextPosition } from "./lib/chain";
import { EXPENSE_CATEGORIES } from "./categoryList";

const categoryValidator = v.union(
  ...EXPENSE_CATEGORIES.map((c) => v.literal(c)),
);

const statusValidator = v.union(
  v.literal("draft"),
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);

const ALLOWED_RECEIPT_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
];
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

const MAX_DESCRIPTION_LEN = 1000;
// Cap at $100,000,000.00 in minor units — well below MAX_SAFE_INTEGER.
const MAX_AMOUNT_MINOR = 100_000_000_00;

function validateAmountOrThrow(amount: number): void {
  if (
    !Number.isInteger(amount) ||
    amount <= 0 ||
    amount > MAX_AMOUNT_MINOR
  ) {
    throw new ConvexError("Amount out of range");
  }
}

function validateDescriptionOrThrow(description: string): string {
  const trimmed = description.trim();
  if (trimmed.length === 0) {
    throw new ConvexError("Description is required");
  }
  if (trimmed.length > MAX_DESCRIPTION_LEN) {
    throw new ConvexError(`Description too long (max ${MAX_DESCRIPTION_LEN} chars)`);
  }
  return trimmed;
}

function validateCurrencyOrThrow(currency: string): string {
  const upper = currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(upper)) {
    throw new ConvexError("Currency must be a 3-letter ISO 4217 code");
  }
  return upper;
}

/**
 * Validates the storage metadata for a receipt. On failure throws AND deletes
 * the orphan blob. Always called from a mutation that's about to bind the
 * storage id to an expense.
 */
/**
 * Validates that a `_storage` upload is a permitted receipt (MIME + size).
 * Throws on failure.
 *
 * NOTE: Convex mutations are atomic — if the mutation throws, every write
 * (including `ctx.storage.delete`) gets rolled back. So we cannot both
 * reject AND clean up the orphaned blob in the same transaction. Orphan
 * cleanup runs daily via `convex/crons.ts → sweepOrphanReceipts`, which
 * deletes `_storage` blobs older than 24h that no expense row references.
 */
async function validateReceiptOrThrow(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
): Promise<void> {
  const meta = await ctx.db.system.get("_storage", storageId);
  if (!meta) {
    throw new ConvexError("Receipt upload not found in storage");
  }
  const okType =
    typeof meta.contentType === "string" &&
    ALLOWED_RECEIPT_MIME.includes(meta.contentType);
  const okSize = meta.size <= MAX_RECEIPT_BYTES;
  if (!okType || !okSize) {
    throw new ConvexError(
      `Receipt must be PNG/JPEG/WEBP/PDF and ≤ 10 MB (got ${meta.contentType ?? "unknown"}, ${meta.size} bytes)`,
    );
  }
}

/**
 * Returns true if the caller is allowed to view a specific expense:
 *   - submitter
 *   - any approver in the chain (current or past)
 *   - holds `expenses.read.team`
 */
async function canViewExpense(
  ctx: QueryCtx,
  caller: Doc<"users">,
  expense: Doc<"expenses">,
): Promise<boolean> {
  if (caller._id === expense.submitterId) return true;
  if (await hasPermission(ctx, caller, PERMISSIONS.expensesReadTeam)) return true;
  const inChain = await ctx.db
    .query("approvals")
    .withIndex("by_expense", (q) => q.eq("expenseId", expense._id))
    .collect();
  return inChain.some((a) => a.approverId === caller._id);
}

/**
 * Creates a draft expense owned by the caller.
 * Permission: `expenses.create`.
 */
export const createDraft = mutation({
  args: {
    description: v.string(),
    amount: v.number(),
    currency: v.string(),
    category: categoryValidator,
    receiptStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    await requirePermission(ctx, me, PERMISSIONS.expensesCreate);
    // Rate limit: max 60 drafts per hour per user.
    await enforceRateLimit(ctx, {
      key: `createDraft:${me._id}`,
      windowMs: 60 * 60 * 1000,
      max: 60,
    });

    validateAmountOrThrow(args.amount);
    const description = validateDescriptionOrThrow(args.description);
    const currency = validateCurrencyOrThrow(args.currency);

    const receiptStorageId = args.receiptStorageId ?? null;
    if (receiptStorageId) {
      await validateReceiptOrThrow(ctx, receiptStorageId);
    }

    const id = await ctx.db.insert("expenses", {
      teamId: me.teamId,
      submitterId: me._id,
      description,
      amount: args.amount,
      currency,
      category: args.category,
      receiptStorageId,
      status: "draft",
      submittedAt: null,
      decidedAt: null,
    });

    return id;
  },
});

/**
 * Updates a draft expense. Owner-only; status must remain `draft`.
 */
export const updateDraft = mutation({
  args: {
    expenseId: v.id("expenses"),
    description: v.optional(v.string()),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    category: v.optional(categoryValidator),
    receiptStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense) throw new ConvexError("Expense not found");
    requireSameTeam(me, expense.teamId);
    if (expense.submitterId !== me._id) {
      throw new ConvexError("Only the submitter can edit a draft");
    }
    if (expense.status !== "draft") {
      throw new ConvexError("Only drafts are editable");
    }

    const patch: Partial<Doc<"expenses">> = {};
    if (args.description !== undefined) {
      patch.description = validateDescriptionOrThrow(args.description);
    }
    if (args.amount !== undefined) {
      validateAmountOrThrow(args.amount);
      patch.amount = args.amount;
    }
    if (args.currency !== undefined) patch.currency = validateCurrencyOrThrow(args.currency);
    if (args.category !== undefined) patch.category = args.category;
    if (args.receiptStorageId !== undefined) {
      // Replacing the receipt — validate the new one (if non-null) and clean up the old one.
      const newReceipt = args.receiptStorageId;
      if (newReceipt !== null) {
        await validateReceiptOrThrow(ctx, newReceipt);
      }
      if (
        expense.receiptStorageId !== null &&
        expense.receiptStorageId !== newReceipt
      ) {
        await ctx.storage.delete(expense.receiptStorageId);
      }
      patch.receiptStorageId = newReceipt;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch("expenses", args.expenseId, patch);
    }
    return await ctx.db.get("expenses", args.expenseId);
  },
});

async function emitSubmissionEvents(
  ctx: MutationCtx,
  args: {
    expense: Doc<"expenses">;
    me: Doc<"users">;
    managerId: Id<"users">;
    fromDraft: boolean;
  },
) {
  await log(ctx, {
    subjectType: "expenses",
    subjectId: args.expense._id,
    teamId: args.expense.teamId,
    causerId: args.me._id,
    event: "submitted",
    description: `Submitted for approval`,
    properties: { managerId: args.managerId },
  });
  // Only emit the draft→pending transition when the expense actually had a
  // draft state. Direct-submission paths skip this event so the activity log
  // reflects the user's mental model ("I just submitted it").
  if (args.fromDraft) {
    await log(ctx, {
      subjectType: "expenses",
      subjectId: args.expense._id,
      teamId: args.expense.teamId,
      causerId: args.me._id,
      event: "status_changed",
      description: `Status: draft → pending`,
      properties: { from: "draft", to: "pending" },
    });
  }
  await ctx.db.insert("notifications", {
    userId: args.managerId,
    teamId: args.expense.teamId,
    type: "approval_requested",
    subjectType: "expenses",
    subjectId: args.expense._id,
    message: `${args.me.name ?? args.me.email ?? "An employee"} submitted an expense for your approval`,
    readAt: null,
  });
}

/**
 * Submits an existing draft for approval.
 *   - Owner-only.
 *   - Caller must have `managerId !== null`.
 *   - Inserts the position-1 approval at `managerId` with state="pending".
 *   - Emits `submitted` and `status_changed` activity.
 *   - Notifies the initial approver.
 */
export const submit = mutation({
  args: { expenseId: v.id("expenses") },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    await requirePermission(ctx, me, PERMISSIONS.expensesCreate);

    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense) throw new ConvexError("Expense not found");
    requireSameTeam(me, expense.teamId);
    if (expense.submitterId !== me._id) {
      throw new ConvexError("Only the submitter can submit");
    }
    if (expense.status !== "draft") {
      throw new ConvexError("Only drafts can be submitted");
    }
    if (me.managerId === null) {
      throw new ConvexError("You have no assigned manager — contact your administrator");
    }
    if (me.managerId === me._id) {
      throw new ConvexError("Cannot submit an expense to yourself");
    }
    if (!expense.receiptStorageId) {
      throw new ConvexError("Attach a receipt before submitting");
    }

    const manager = await ctx.db.get("users", me.managerId);
    if (!manager) throw new ConvexError("Assigned manager not found");
    requireSameTeam(me, manager.teamId);

    const submittedAt = Date.now();
    await ctx.db.patch("expenses", args.expenseId, {
      status: "pending",
      submittedAt,
    });
    await ctx.db.insert("approvals", {
      expenseId: args.expenseId,
      teamId: expense.teamId,
      position: 1,
      approverId: me.managerId,
      state: "pending",
      submittedAt,
      decidedAt: null,
      decisionNote: null,
    });
    await emitSubmissionEvents(ctx, {
      expense,
      me,
      managerId: me.managerId,
      fromDraft: true,
    });
    return args.expenseId;
  },
});

/**
 * Atomic create-and-submit. Used when the caller submits a fresh expense
 * from the form without going through a draft. The expense is born in the
 * "pending" state — no draft row, no draft→pending status_changed event.
 *
 * Atomicity matters: every guard runs BEFORE the insert. If any precondition
 * fails (no managerId, missing receipt, validation), nothing is written.
 */
export const createAndSubmit = mutation({
  args: {
    description: v.string(),
    amount: v.number(),
    currency: v.string(),
    category: categoryValidator,
    receiptStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    await requirePermission(ctx, me, PERMISSIONS.expensesCreate);
    // Rate limit: max 30 submissions per hour per user.
    await enforceRateLimit(ctx, {
      key: `createAndSubmit:${me._id}`,
      windowMs: 60 * 60 * 1000,
      max: 30,
    });

    validateAmountOrThrow(args.amount);
    const description = validateDescriptionOrThrow(args.description);
    const currency = validateCurrencyOrThrow(args.currency);
    if (me.managerId === null) {
      throw new ConvexError("You have no assigned manager — contact your administrator");
    }
    if (me.managerId === me._id) {
      throw new ConvexError("Cannot submit an expense to yourself");
    }

    const manager = await ctx.db.get("users", me.managerId);
    if (!manager) throw new ConvexError("Assigned manager not found");
    requireSameTeam(me, manager.teamId);

    await validateReceiptOrThrow(ctx, args.receiptStorageId);

    const submittedAt = Date.now();
    const expenseId = await ctx.db.insert("expenses", {
      teamId: me.teamId,
      submitterId: me._id,
      description,
      amount: args.amount,
      currency,
      category: args.category,
      receiptStorageId: args.receiptStorageId,
      status: "pending",
      submittedAt,
      decidedAt: null,
    });
    await ctx.db.insert("approvals", {
      expenseId,
      teamId: me.teamId,
      position: 1,
      approverId: me.managerId,
      state: "pending",
      submittedAt,
      decidedAt: null,
      decisionNote: null,
    });

    const expense = (await ctx.db.get("expenses", expenseId))!;
    await emitSubmissionEvents(ctx, {
      expense,
      me,
      managerId: me.managerId,
      fromDraft: false,
    });

    return expenseId;
  },
});

/**
 * Edits a rejected expense and resubmits it for approval atomically.
 *
 * Owner-only; status must be `rejected`. Reuses the field-patch + receipt-swap
 * logic from `updateDraft` and the chain/notify logic from `submit`. Inserts a
 * fresh position-N approval row pointing at the submitter's current manager,
 * preserving the prior rejected approval rows (and their `decisionNote`s) so
 * the audit trail keeps every rejection note across cycles.
 */
export const editAndResubmit = mutation({
  args: {
    expenseId: v.id("expenses"),
    description: v.string(),
    amount: v.number(),
    currency: v.string(),
    category: categoryValidator,
    receiptStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);

    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense) throw new ConvexError("Expense not found");
    requireSameTeam(me, expense.teamId);
    if (expense.submitterId !== me._id) {
      throw new ConvexError("Only the submitter can resubmit this expense");
    }
    if (expense.status !== "rejected") {
      throw new ConvexError("Only rejected expenses can be edited and resubmitted");
    }

    await requirePermission(ctx, me, PERMISSIONS.expensesCreate);

    validateAmountOrThrow(args.amount);
    const description = validateDescriptionOrThrow(args.description);
    const currency = validateCurrencyOrThrow(args.currency);

    if (me.managerId === null) {
      throw new ConvexError("You have no assigned manager — contact your administrator");
    }
    if (me.managerId === me._id) {
      throw new ConvexError("Cannot resubmit an expense to yourself");
    }
    const manager = await ctx.db.get("users", me.managerId);
    if (!manager) throw new ConvexError("Assigned manager not found");
    requireSameTeam(me, manager.teamId);

    // Receipt: validate the new (or kept) one; swap-delete the old blob if it
    // changed. Mirror of updateDraft's receipt logic.
    await validateReceiptOrThrow(ctx, args.receiptStorageId);
    if (
      expense.receiptStorageId !== null &&
      expense.receiptStorageId !== args.receiptStorageId
    ) {
      await ctx.storage.delete(expense.receiptStorageId);
    }

    // Find the most recent rejected approval to surface its note in the
    // resubmit event. Highest `position` with state="rejected" wins.
    const chain = await ctx.db
      .query("approvals")
      .withIndex("by_expense", (q) => q.eq("expenseId", args.expenseId))
      .collect();
    const lastRejected = chain
      .filter((a) => a.state === "rejected")
      .sort((a, b) => b.position - a.position)[0];
    const previousRejectionNote = lastRejected?.decisionNote ?? "";

    const submittedAt = Date.now();
    await ctx.db.patch("expenses", args.expenseId, {
      description,
      amount: args.amount,
      currency,
      category: args.category,
      receiptStorageId: args.receiptStorageId,
      status: "pending",
      submittedAt,
      decidedAt: null,
    });

    const newPos = nextPosition(chain.length);
    await ctx.db.insert("approvals", {
      expenseId: args.expenseId,
      teamId: expense.teamId,
      position: newPos,
      approverId: me.managerId,
      state: "pending",
      submittedAt,
      decidedAt: null,
      decisionNote: null,
    });

    await log(ctx, {
      subjectType: "expenses",
      subjectId: args.expenseId,
      teamId: expense.teamId,
      causerId: me._id,
      event: "resubmitted",
      description: `Edited and resubmitted`,
      properties: {
        managerId: me.managerId,
        previousRejectionNote,
      },
    });
    await log(ctx, {
      subjectType: "expenses",
      subjectId: args.expenseId,
      teamId: expense.teamId,
      causerId: me._id,
      event: "status_changed",
      description: `Status: rejected → pending (resubmitted)`,
      properties: { from: "rejected", to: "pending" },
    });

    await ctx.db.insert("notifications", {
      userId: me.managerId,
      teamId: expense.teamId,
      type: "approval_requested",
      subjectType: "expenses",
      subjectId: args.expenseId,
      message: `${me.name ?? me.email ?? "An employee"} resubmitted an expense for your approval`,
      readAt: null,
    });

    return args.expenseId;
  },
});

/**
 * Deletes a draft expense (owner-only). Cleans up the receipt blob.
 */
export const deleteDraft = mutation({
  args: { expenseId: v.id("expenses") },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense) throw new ConvexError("Expense not found");
    requireSameTeam(me, expense.teamId);
    if (expense.submitterId !== me._id) {
      throw new ConvexError("Only the submitter can delete a draft");
    }
    if (expense.status !== "draft") {
      throw new ConvexError("Only drafts can be deleted");
    }
    if (expense.receiptStorageId !== null) {
      await ctx.storage.delete(expense.receiptStorageId);
    }
    await ctx.db.delete("expenses", args.expenseId);
  },
});

/**
 * Returns a single expense the caller is allowed to view.
 */
export const get = query({
  args: { expenseId: v.id("expenses") },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense) return null;
    requireSameTeam(me, expense.teamId);
    const allowed = await canViewExpense(ctx, me, expense);
    if (!allowed) {
      throw new ConvexError("Forbidden: you cannot view this expense");
    }
    return expense;
  },
});

const sortDirValidator = v.optional(
  v.union(v.literal("asc"), v.literal("desc")),
);

/**
 * Server-paginated list of the caller's own expenses, with filters and
 * sort direction. Picks the most selective index for the active filter.
 *
 * Returns the standard Convex paginate envelope:
 *   { page, isDone, continueCursor }
 */
export const listMine = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(statusValidator),
    category: v.optional(categoryValidator),
    fromMs: v.optional(v.number()),
    toMs: v.optional(v.number()),
    sortDir: sortDirValidator,
  },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    const dir = args.sortDir ?? "desc";

    // Pick the most selective index for the active filter; re-apply any
    // remaining filters via `.filter()` (which is paginate-safe).
    const usingStatusIndex = args.status !== undefined;
    const usingCategoryIndex =
      !usingStatusIndex && args.category !== undefined;

    const indexed = usingStatusIndex
      ? ctx.db
          .query("expenses")
          .withIndex("by_submitter_and_status", (q) =>
            q.eq("submitterId", me._id).eq("status", args.status!),
          )
      : usingCategoryIndex
        ? ctx.db
            .query("expenses")
            .withIndex("by_submitter_and_category", (q) =>
              q.eq("submitterId", me._id).eq("category", args.category!),
            )
        : ctx.db
            .query("expenses")
            .withIndex("by_submitter_and_submitted_at", (q) =>
              q.eq("submitterId", me._id),
            );

    const filtered = applyExtraFilterChain(indexed, {
      category: usingCategoryIndex ? undefined : args.category,
      fromMs: args.fromMs,
      toMs: args.toMs,
    });
    return await filtered.order(dir).paginate(args.paginationOpts);
  },
});

/**
 * Server-paginated team-wide list. Permission: `expenses.read.team`.
 */
export const listForTeam = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(statusValidator),
    category: v.optional(categoryValidator),
    fromMs: v.optional(v.number()),
    toMs: v.optional(v.number()),
    sortDir: sortDirValidator,
  },
  handler: async (ctx, args) => {
    const me = await requireAuth(ctx);
    await requirePermission(ctx, me, PERMISSIONS.expensesReadTeam);
    const dir = args.sortDir ?? "desc";

    const usingStatusIndex = args.status !== undefined;
    const usingCategoryIndex =
      !usingStatusIndex && args.category !== undefined;

    const indexed = usingStatusIndex
      ? ctx.db
          .query("expenses")
          .withIndex("by_team_and_status", (q) =>
            q.eq("teamId", me.teamId).eq("status", args.status!),
          )
      : usingCategoryIndex
        ? ctx.db
            .query("expenses")
            .withIndex("by_team_and_category", (q) =>
              q.eq("teamId", me.teamId).eq("category", args.category!),
            )
        : ctx.db
            .query("expenses")
            .withIndex("by_team_and_submitted_at", (q) => q.eq("teamId", me.teamId));

    const filtered = applyExtraFilterChain(indexed, {
      category: usingCategoryIndex ? undefined : args.category,
      fromMs: args.fromMs,
      toMs: args.toMs,
    });
    return await filtered.order(dir).paginate(args.paginationOpts);
  },
});

/**
 * Applies the secondary filters (the ones the chosen index can't already
 * narrow) directly inside the query. Stays compatible with `.paginate()`
 * because `.filter()` runs server-side during the scan, so page sizes
 * aren't broken by post-fetch filtering.
 */
function applyExtraFilterChain<
  Q extends { filter: (fn: (q: any) => any) => Q },
>(
  q: Q,
  args: {
    category?: string;
    fromMs?: number;
    toMs?: number;
  },
): Q {
  if (
    args.category === undefined &&
    args.fromMs === undefined &&
    args.toMs === undefined
  ) {
    return q;
  }
  return q.filter((qb) => {
    const conditions: any[] = [];
    if (args.category !== undefined) {
      conditions.push(qb.eq(qb.field("category"), args.category));
    }
    if (args.fromMs !== undefined) {
      conditions.push(qb.gte(qb.field("submittedAt"), args.fromMs));
    }
    if (args.toMs !== undefined) {
      conditions.push(qb.lte(qb.field("submittedAt"), args.toMs));
    }
    if (conditions.length === 1) return conditions[0];
    return qb.and(...conditions);
  });
}
