/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import {
  makeT,
  makeUser,
  seedRolesAndTeams,
  storeReceiptForTest,
} from "./testHelpers.utils";

async function setupWorld() {
  const t = makeT();
  const world = await seedRolesAndTeams(t);
  const { userId: managerId, subject: managerSubject } = await makeUser(t, {
    email: "m@hq.test",
    teamId: world.teamId,
    managerId: null,
    roleIds: [world.roles.manager],
  });
  const { userId: employeeId, subject: employeeSubject } = await makeUser(t, {
    email: "e@hq.test",
    teamId: world.teamId,
    managerId,
    roleIds: [world.roles.employee],
  });
  const { userId: orphanId, subject: orphanSubject } = await makeUser(t, {
    email: "orphan@hq.test",
    teamId: world.teamId,
    managerId: null, // no manager → cannot submit
    roleIds: [world.roles.employee],
  });
  return { t, world, managerId, managerSubject, employeeId, employeeSubject, orphanId, orphanSubject };
}

describe("expenses lifecycle", () => {
  test("createDraft inserts a draft and rejects negative amounts", async () => {
    const { t, employeeSubject } = await setupWorld();
    const asEmp = t.withIdentity({ subject: employeeSubject });

    const draftId = await asEmp.mutation(api.expenses.createDraft, {
      description: "Coffee",
      amount: 500,
      currency: "usd",
      category: "meals",
    });
    expect(draftId).toBeDefined();

    await expect(
      asEmp.mutation(api.expenses.createDraft, {
        description: "Bad",
        amount: -100,
        currency: "USD",
        category: "meals",
      }),
    ).rejects.toThrow(/out of range/);

    await expect(
      asEmp.mutation(api.expenses.createDraft, {
        description: "   ",
        amount: 100,
        currency: "USD",
        category: "meals",
      }),
    ).rejects.toThrow(/Description/);
  });

  test("updateDraft works only for the owner and only on drafts", async () => {
    const { t, employeeSubject, managerSubject } = await setupWorld();
    const asEmp = t.withIdentity({ subject: employeeSubject });
    const asMgr = t.withIdentity({ subject: managerSubject });

    const draftId = await asEmp.mutation(api.expenses.createDraft, {
      description: "Lunch",
      amount: 1500,
      currency: "USD",
      category: "meals",
    });

    await asEmp.mutation(api.expenses.updateDraft, {
      expenseId: draftId,
      description: "Lunch with client",
    });

    // Manager can't edit someone else's draft.
    await expect(
      asMgr.mutation(api.expenses.updateDraft, {
        expenseId: draftId,
        description: "hijack",
      }),
    ).rejects.toThrow(/submitter/);
  });

  test("submit fails when the user has no manager", async () => {
    const { t, orphanSubject } = await setupWorld();
    const asOrphan = t.withIdentity({ subject: orphanSubject });
    const draftId = await asOrphan.mutation(api.expenses.createDraft, {
      description: "Pen",
      amount: 200,
      currency: "USD",
      category: "supplies",
    });
    await expect(
      asOrphan.mutation(api.expenses.submit, { expenseId: draftId }),
    ).rejects.toThrow(/no assigned manager/);
  });

  test("submit fails without a receipt", async () => {
    const { t, employeeSubject } = await setupWorld();
    const asEmp = t.withIdentity({ subject: employeeSubject });
    const draftId = await asEmp.mutation(api.expenses.createDraft, {
      description: "Lunch",
      amount: 1500,
      currency: "USD",
      category: "meals",
    });
    await expect(
      asEmp.mutation(api.expenses.submit, { expenseId: draftId }),
    ).rejects.toThrow(/receipt/i);
  });

  test("submit transitions draft → pending and inserts a position-1 approval", async () => {
    const { t, employeeSubject, managerId } = await setupWorld();
    const asEmp = t.withIdentity({ subject: employeeSubject });

    const storageId = await storeReceiptForTest(t, {
      bytes: 1024,
      contentType: "image/jpeg",
    });

    const draftId = await asEmp.mutation(api.expenses.createDraft, {
      description: "Lunch",
      amount: 1500,
      currency: "USD",
      category: "meals",
      receiptStorageId: storageId,
    });
    await asEmp.mutation(api.expenses.submit, { expenseId: draftId });

    const expense = await asEmp.query(api.expenses.get, { expenseId: draftId });
    expect(expense?.status).toBe("pending");
    expect(expense?.submittedAt).not.toBeNull();

    // Approval row exists at the manager.
    const approvals = await t.run(async (ctx) =>
      await ctx.db
        .query("approvals")
        .withIndex("by_expense", (q) => q.eq("expenseId", draftId))
        .collect(),
    );
    expect(approvals).toHaveLength(1);
    expect(approvals[0].approverId).toBe(managerId);
    expect(approvals[0].state).toBe("pending");
    expect(approvals[0].position).toBe(1);
  });

  test("submitted expense is immutable to the submitter", async () => {
    const { t, employeeSubject } = await setupWorld();
    const asEmp = t.withIdentity({ subject: employeeSubject });

    const storageId = await storeReceiptForTest(t, {
      bytes: 1024,
      contentType: "image/png",
    });
    const draftId = await asEmp.mutation(api.expenses.createDraft, {
      description: "Test",
      amount: 1000,
      currency: "USD",
      category: "other",
      receiptStorageId: storageId,
    });
    await asEmp.mutation(api.expenses.submit, { expenseId: draftId });

    await expect(
      asEmp.mutation(api.expenses.updateDraft, {
        expenseId: draftId,
        description: "Edited after submit",
      }),
    ).rejects.toThrow(/drafts/i);
  });
});

describe("editAndResubmit", () => {
  /**
   * Helper: create + submit + reject so the expense ends in "rejected" state
   * with one rejection note. Returns the expenseId, helpers, and the rejection
   * note used.
   */
  async function setupRejected(note: string = "Missing tax line") {
    const ctx = await setupWorld();
    const { t, employeeSubject, managerSubject } = ctx;
    const asEmp = t.withIdentity({ subject: employeeSubject });
    const asMgr = t.withIdentity({ subject: managerSubject });

    const storageId = await storeReceiptForTest(t, {
      bytes: 1024,
      contentType: "image/png",
    });
    const expenseId = await asEmp.mutation(api.expenses.createAndSubmit, {
      description: "Lunch",
      amount: 1500,
      currency: "USD",
      category: "meals",
      receiptStorageId: storageId,
    });
    await asMgr.mutation(api.approvals.reject, { expenseId, note });
    return { ...ctx, asEmp, asMgr, expenseId, storageId, note };
  }

  test("happy path: rejected → editAndResubmit flips status to pending and inserts a new approval row", async () => {
    const { t, asEmp, expenseId, managerId } = await setupRejected();

    const newReceipt = await storeReceiptForTest(t, {
      bytes: 2048,
      contentType: "image/jpeg",
    });
    await asEmp.mutation(api.expenses.editAndResubmit, {
      expenseId,
      description: "Lunch with client (corrected)",
      amount: 1800,
      currency: "USD",
      category: "meals",
      receiptStorageId: newReceipt,
    });

    const expense = await asEmp.query(api.expenses.get, { expenseId });
    expect(expense?.status).toBe("pending");
    expect(expense?.amount).toBe(1800);
    expect(expense?.description).toBe("Lunch with client (corrected)");
    expect(expense?.decidedAt).toBeNull();

    const approvals = await t.run(async (ctx) =>
      await ctx.db
        .query("approvals")
        .withIndex("by_expense", (q) => q.eq("expenseId", expenseId))
        .collect(),
    );
    // Two rows now: original rejected step + new pending step.
    expect(approvals).toHaveLength(2);
    const rejected = approvals.find((a) => a.state === "rejected");
    const pending = approvals.find((a) => a.state === "pending");
    expect(rejected?.position).toBe(1);
    expect(pending?.position).toBe(2);
    expect(pending?.approverId).toBe(managerId);

    // Activity log got resubmitted + status_changed events.
    const events = await t.run(async (ctx) =>
      await ctx.db
        .query("activityLog")
        .withIndex("by_subject", (q) =>
          q.eq("subjectType", "expenses").eq("subjectId", expenseId),
        )
        .collect(),
    );
    expect(events.some((e) => e.event === "resubmitted")).toBe(true);
    expect(
      events.some(
        (e) =>
          e.event === "status_changed" &&
          e.properties.from === "rejected" &&
          e.properties.to === "pending",
      ),
    ).toBe(true);
  });

  test("only the submitter can edit and resubmit", async () => {
    const { asMgr, expenseId, t } = await setupRejected();
    const newReceipt = await storeReceiptForTest(t, {
      bytes: 1024,
      contentType: "image/png",
    });
    await expect(
      asMgr.mutation(api.expenses.editAndResubmit, {
        expenseId,
        description: "hijack",
        amount: 100,
        currency: "USD",
        category: "meals",
        receiptStorageId: newReceipt,
      }),
    ).rejects.toThrow(/submitter/i);
  });

  test("only rejected expenses can be resubmitted", async () => {
    const { t, employeeSubject } = await setupWorld();
    const asEmp = t.withIdentity({ subject: employeeSubject });
    const storageId = await storeReceiptForTest(t, {
      bytes: 1024,
      contentType: "image/png",
    });
    const draftId = await asEmp.mutation(api.expenses.createDraft, {
      description: "Pen",
      amount: 200,
      currency: "USD",
      category: "supplies",
      receiptStorageId: storageId,
    });
    // Status is "draft" — not allowed.
    await expect(
      asEmp.mutation(api.expenses.editAndResubmit, {
        expenseId: draftId,
        description: "Pen",
        amount: 200,
        currency: "USD",
        category: "supplies",
        receiptStorageId: storageId,
      }),
    ).rejects.toThrow(/rejected/i);
  });

  test("each rejection cycle preserves its own rejection note", async () => {
    const { t, asEmp, asMgr, expenseId } = await setupRejected("First problem");

    const r2 = await storeReceiptForTest(t, {
      bytes: 1024,
      contentType: "image/png",
    });
    await asEmp.mutation(api.expenses.editAndResubmit, {
      expenseId,
      description: "Lunch v2",
      amount: 1500,
      currency: "USD",
      category: "meals",
      receiptStorageId: r2,
    });
    await asMgr.mutation(api.approvals.reject, {
      expenseId,
      note: "Second problem",
    });

    const approvals = await t.run(async (ctx) =>
      await ctx.db
        .query("approvals")
        .withIndex("by_expense", (q) => q.eq("expenseId", expenseId))
        .collect(),
    );
    const rejectedNotes = approvals
      .filter((a) => a.state === "rejected")
      .sort((a, b) => a.position - b.position)
      .map((a) => a.decisionNote);
    expect(rejectedNotes).toEqual(["First problem", "Second problem"]);

    const rejectedEvents = await t.run(async (ctx) =>
      await ctx.db
        .query("activityLog")
        .withIndex("by_subject", (q) =>
          q.eq("subjectType", "expenses").eq("subjectId", expenseId),
        )
        .collect()
        .then((rows) => rows.filter((r) => r.event === "rejected")),
    );
    const eventNotes = rejectedEvents
      .map((e) => e.properties.note)
      .sort();
    expect(eventNotes).toEqual(["First problem", "Second problem"]);
  });
});
