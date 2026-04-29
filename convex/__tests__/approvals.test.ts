/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import {
  makeT,
  makeUser,
  seedRolesAndTeams,
  storeReceiptForTest,
} from "./testHelpers.utils";

async function setupSubmittedExpense() {
  const t = makeT();
  const world = await seedRolesAndTeams(t);
  const { userId: m1, subject: m1Subject } = await makeUser(t, {
    email: "m1@hq.test",
    teamId: world.teamId,
    managerId: null,
    roleIds: [world.roles.manager],
  });
  const { userId: m2, subject: m2Subject } = await makeUser(t, {
    email: "m2@hq.test",
    teamId: world.teamId,
    managerId: null,
    roleIds: [world.roles.manager],
  });
  const { userId: emp, subject: empSubject } = await makeUser(t, {
    email: "e@hq.test",
    teamId: world.teamId,
    managerId: m1,
    roleIds: [world.roles.employee],
  });

  const asEmp = t.withIdentity({ subject: empSubject });
  const storageId = await storeReceiptForTest(t, {
    bytes: 2048,
    contentType: "image/jpeg",
  });
  const expenseId = await asEmp.mutation(api.expenses.createDraft, {
    description: "Conference ticket",
    amount: 25000,
    currency: "USD",
    category: "training",
    receiptStorageId: storageId,
  });
  await asEmp.mutation(api.expenses.submit, { expenseId });

  return {
    t,
    world,
    m1,
    m1Subject,
    m2,
    m2Subject,
    emp,
    empSubject,
    expenseId,
  };
}

describe("approvals.approve / reject", () => {
  test("manager approves → expense becomes terminal `approved`", async () => {
    const { t, m1Subject, expenseId } = await setupSubmittedExpense();
    const asM1 = t.withIdentity({ subject: m1Subject });
    const result = await asM1.mutation(api.approvals.approve, { expenseId });
    expect(result.terminal).toBe(true);

    const expense = await asM1.query(api.expenses.get, { expenseId });
    expect(expense?.status).toBe("approved");
    expect(expense?.decidedAt).not.toBeNull();
  });

  test("manager rejects with note → expense terminal `rejected` and note stored", async () => {
    const { t, m1Subject, expenseId } = await setupSubmittedExpense();
    const asM1 = t.withIdentity({ subject: m1Subject });
    await asM1.mutation(api.approvals.reject, {
      expenseId,
      note: "Missing itemized total",
    });
    const expense = await asM1.query(api.expenses.get, { expenseId });
    expect(expense?.status).toBe("rejected");

    const chain = await t.run(async (ctx) =>
      await ctx.db
        .query("approvals")
        .withIndex("by_expense", (q) => q.eq("expenseId", expenseId))
        .collect(),
    );
    expect(chain[0].state).toBe("rejected");
    expect(chain[0].decisionNote).toContain("Missing itemized total");
  });

  test("non-current approver cannot act on the step", async () => {
    const { t, m2Subject, expenseId } = await setupSubmittedExpense();
    const asM2 = t.withIdentity({ subject: m2Subject });
    await expect(
      asM2.mutation(api.approvals.approve, { expenseId }),
    ).rejects.toThrow(/current approver/);
  });

  test("approve with handoff inserts the next pending step", async () => {
    const { t, m1Subject, m2, expenseId } = await setupSubmittedExpense();
    const asM1 = t.withIdentity({ subject: m1Subject });
    const result = await asM1.mutation(api.approvals.approve, {
      expenseId,
      addNextApproverId: m2,
    });
    expect(result.terminal).toBe(false);

    const chain = await t.run(async (ctx) =>
      await ctx.db
        .query("approvals")
        .withIndex("by_expense", (q) => q.eq("expenseId", expenseId))
        .collect(),
    );
    expect(chain).toHaveLength(2);
    const step1 = chain.find((a) => a.position === 1);
    const step2 = chain.find((a) => a.position === 2);
    expect(step1?.state).toBe("approved");
    expect(step2?.state).toBe("pending");
    expect(step2?.approverId).toBe(m2);

    // Expense status remains pending (chain not terminal yet).
    const expense = await asM1.query(api.expenses.get, { expenseId });
    expect(expense?.status).toBe("pending");
  });

  test("self-handoff is blocked (cannot add submitter as next approver)", async () => {
    const { t, m1Subject, emp, expenseId } = await setupSubmittedExpense();
    const asM1 = t.withIdentity({ subject: m1Subject });
    await expect(
      asM1.mutation(api.approvals.approve, {
        expenseId,
        addNextApproverId: emp,
      }),
    ).rejects.toThrow();
  });

  test("duplicate approver blocked when handing off", async () => {
    const { t, m1Subject, m1, expenseId } = await setupSubmittedExpense();
    const asM1 = t.withIdentity({ subject: m1Subject });
    await expect(
      asM1.mutation(api.approvals.approve, {
        expenseId,
        addNextApproverId: m1,
      }),
    ).rejects.toThrow();
  });

  test("reject without a note is rejected", async () => {
    const { t, m1Subject, expenseId } = await setupSubmittedExpense();
    const asM1 = t.withIdentity({ subject: m1Subject });
    await expect(
      asM1.mutation(api.approvals.reject, { expenseId, note: "   " }),
    ).rejects.toThrow(/note/);
  });
});
