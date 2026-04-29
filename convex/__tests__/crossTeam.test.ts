/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import {
  makeT,
  makeUser,
  seedRolesAndTeams,
  storeReceiptForTest,
} from "./testHelpers.utils";

describe("cross-team isolation", () => {
  test("a user in team B cannot read team A expenses (via expenses.get)", async () => {
    const t = makeT();
    const world = await seedRolesAndTeams(t);

    // Team A — manager + employee
    const { userId: aManagerId } = await makeUser(t, {
      email: "a-mgr@hq.test",
      teamId: world.teamId,
      managerId: null,
      roleIds: [world.roles.manager],
    });
    const { subject: aEmpSubject } = await makeUser(t, {
      email: "a-emp@hq.test",
      teamId: world.teamId,
      managerId: aManagerId,
      roleIds: [world.roles.employee],
    });

    // Team B — outsider
    const { subject: bSubject } = await makeUser(t, {
      email: "outsider@branch.test",
      teamId: world.otherTeamId,
      managerId: null,
      roleIds: [world.roles.manager],
    });

    // Team A employee submits an expense.
    const asA = t.withIdentity({ subject: aEmpSubject });
    const storageId = await storeReceiptForTest(t, {
      bytes: 1024,
      contentType: "image/jpeg",
    });
    const expenseId = await asA.mutation(api.expenses.createDraft, {
      description: "team A expense",
      amount: 1000,
      currency: "USD",
      category: "other",
      receiptStorageId: storageId,
    });
    await asA.mutation(api.expenses.submit, { expenseId });

    // Team B user attempts to read.
    const asB = t.withIdentity({ subject: bSubject });
    await expect(
      asB.query(api.expenses.get, { expenseId }),
    ).rejects.toThrow(/cross-team|Forbidden/);
  });

  test("a team B user cannot access a team A receipt URL", async () => {
    const t = makeT();
    const world = await seedRolesAndTeams(t);

    const { userId: aManagerId } = await makeUser(t, {
      email: "a-mgr@hq.test",
      teamId: world.teamId,
      managerId: null,
      roleIds: [world.roles.manager],
    });
    const { subject: aEmpSubject } = await makeUser(t, {
      email: "a-emp@hq.test",
      teamId: world.teamId,
      managerId: aManagerId,
      roleIds: [world.roles.employee],
    });
    const { subject: bSubject } = await makeUser(t, {
      email: "out@branch.test",
      teamId: world.otherTeamId,
      managerId: null,
      roleIds: [world.roles.manager],
    });

    const asA = t.withIdentity({ subject: aEmpSubject });
    const storageId = await storeReceiptForTest(t, {
      bytes: 1024,
      contentType: "image/jpeg",
    });
    const expenseId = await asA.mutation(api.expenses.createDraft, {
      description: "private",
      amount: 1000,
      currency: "USD",
      category: "other",
      receiptStorageId: storageId,
    });

    const asB = t.withIdentity({ subject: bSubject });
    await expect(
      asB.query(api.files.getReceiptUrl, { expenseId }),
    ).rejects.toThrow(/cross-team|Forbidden/);
  });

  test("a non-chain same-team user cannot read another's expense", async () => {
    const t = makeT();
    const world = await seedRolesAndTeams(t);

    const { userId: managerId } = await makeUser(t, {
      email: "mgr@hq.test",
      teamId: world.teamId,
      managerId: null,
      roleIds: [world.roles.manager],
    });
    const { subject: emp1Subject } = await makeUser(t, {
      email: "e1@hq.test",
      teamId: world.teamId,
      managerId,
      roleIds: [world.roles.employee],
    });
    const { subject: emp2Subject } = await makeUser(t, {
      email: "e2@hq.test",
      teamId: world.teamId,
      managerId,
      roleIds: [world.roles.employee],
    });

    const asEmp1 = t.withIdentity({ subject: emp1Subject });
    const storageId = await storeReceiptForTest(t, {
      bytes: 1024,
      contentType: "image/jpeg",
    });
    const expenseId = await asEmp1.mutation(api.expenses.createDraft, {
      description: "e1's private expense",
      amount: 1000,
      currency: "USD",
      category: "other",
      receiptStorageId: storageId,
    });
    await asEmp1.mutation(api.expenses.submit, { expenseId });

    // Same team but not in chain, no expenses.read.team perm.
    const asEmp2 = t.withIdentity({ subject: emp2Subject });
    await expect(
      asEmp2.query(api.expenses.get, { expenseId }),
    ).rejects.toThrow(/Forbidden/);
  });
});
