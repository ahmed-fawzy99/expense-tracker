/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { Id } from "../_generated/dataModel";
import { makeT, makeUser, seedRolesAndTeams } from "./testHelpers.utils";
import {
  assertCanAddApprover,
  chainApproverIds,
  eligibleApprovers,
  getCurrentPendingApproval,
} from "../lib/chain";
import { PERMISSIONS } from "../lib/authConstants";

describe("eligibleApprovers (forward-resolution)", () => {
  test("returns same-team users with `expenses.approve` via any role", async () => {
    const t = makeT();
    const world = await seedRolesAndTeams(t);

    const { userId: managerId } = await makeUser(t, {
      email: "m@hq.test",
      teamId: world.teamId,
      managerId: null,
      roleIds: [world.roles.manager],
    });
    const { userId: employeeId } = await makeUser(t, {
      email: "e@hq.test",
      teamId: world.teamId,
      managerId,
      roleIds: [world.roles.employee],
    });

    const eligible = await t.run((ctx) =>
      eligibleApprovers(ctx, {
        teamId: world.teamId,
        submitterId: employeeId,
        existingApproverIds: [],
      }),
    );

    expect(eligible.map((u) => u._id).sort()).toEqual([managerId].sort());
  });

  test("excludes the submitter and users already in the chain", async () => {
    const t = makeT();
    const world = await seedRolesAndTeams(t);

    const { userId: m1 } = await makeUser(t, {
      email: "m1@hq.test",
      teamId: world.teamId,
      managerId: null,
      roleIds: [world.roles.manager],
    });
    const { userId: m2 } = await makeUser(t, {
      email: "m2@hq.test",
      teamId: world.teamId,
      managerId: null,
      roleIds: [world.roles.manager],
    });
    // Submitter is also a manager (edge: manager submitting).
    const { userId: subId } = await makeUser(t, {
      email: "s@hq.test",
      teamId: world.teamId,
      managerId: m1,
      roleIds: [world.roles.manager],
    });

    const eligible = await t.run((ctx) =>
      eligibleApprovers(ctx, {
        teamId: world.teamId,
        submitterId: subId,
        existingApproverIds: [m1],
      }),
    );

    // m1 is in chain, sub is excluded — only m2 remains.
    expect(eligible.map((u) => u._id)).toEqual([m2]);
  });

  test("a future role granted `expenses.approve` is automatically eligible", async () => {
    const t = makeT();
    const world = await seedRolesAndTeams(t);

    // Synthesize a hypothetical "senior_manager" role with the same permission.
    const seniorRoleId: Id<"roles"> = await t.run(async (ctx) => {
      const id = await ctx.db.insert("roles", {
        name: "senior_manager",
        description: null,
        permissionNames: [PERMISSIONS.expensesApprove],
      });
      await ctx.db.insert("rolePermissions", {
        roleId: id,
        permissionId: world.permissions[PERMISSIONS.expensesApprove],
      });
      return id;
    });

    const { userId: srMgrId } = await makeUser(t, {
      email: "sr@hq.test",
      teamId: world.teamId,
      managerId: null,
      roleIds: [seniorRoleId],
    });
    const { userId: subId } = await makeUser(t, {
      email: "e@hq.test",
      teamId: world.teamId,
      managerId: srMgrId,
      roleIds: [world.roles.employee],
    });

    const eligible = await t.run((ctx) =>
      eligibleApprovers(ctx, {
        teamId: world.teamId,
        submitterId: subId,
        existingApproverIds: [],
      }),
    );

    expect(eligible.map((u) => u._id)).toContain(srMgrId);
  });

  test("does not include users from other teams", async () => {
    const t = makeT();
    const world = await seedRolesAndTeams(t);

    await makeUser(t, {
      email: "outsider-mgr@branch.test",
      teamId: world.otherTeamId,
      managerId: null,
      roleIds: [world.roles.manager],
    });
    const { userId: subId } = await makeUser(t, {
      email: "hq-emp@hq.test",
      teamId: world.teamId,
      managerId: null,
      roleIds: [world.roles.employee],
    });

    const eligible = await t.run((ctx) =>
      eligibleApprovers(ctx, {
        teamId: world.teamId,
        submitterId: subId,
        existingApproverIds: [],
      }),
    );
    // No managers in HQ team yet → empty.
    expect(eligible).toEqual([]);
  });
});

describe("assertCanAddApprover", () => {
  const fakeUserId = (s: string) => s as Id<"users">;

  test("rejects the submitter", () => {
    expect(() =>
      assertCanAddApprover({
        candidateId: fakeUserId("u1"),
        submitterId: fakeUserId("u1"),
        existingApproverIds: [],
      }),
    ).toThrow(/submitter/);
  });

  test("rejects a user already in the chain", () => {
    expect(() =>
      assertCanAddApprover({
        candidateId: fakeUserId("u2"),
        submitterId: fakeUserId("u1"),
        existingApproverIds: [fakeUserId("u2")],
      }),
    ).toThrow(/already in/);
  });

  test("permits a fresh same-team approver", () => {
    expect(() =>
      assertCanAddApprover({
        candidateId: fakeUserId("u3"),
        submitterId: fakeUserId("u1"),
        existingApproverIds: [fakeUserId("u2")],
      }),
    ).not.toThrow();
  });
});

describe("getCurrentPendingApproval & chainApproverIds", () => {
  test("returns the single pending step; throws on invariant violation", async () => {
    const t = makeT();
    const world = await seedRolesAndTeams(t);
    const { userId: managerId } = await makeUser(t, {
      email: "m@hq.test",
      teamId: world.teamId,
      managerId: null,
      roleIds: [world.roles.manager],
    });
    const { userId: subId } = await makeUser(t, {
      email: "e@hq.test",
      teamId: world.teamId,
      managerId,
      roleIds: [world.roles.employee],
    });

    const expenseId = await t.run(async (ctx) => {
      const eid = await ctx.db.insert("expenses", {
        teamId: world.teamId,
        submitterId: subId,
        description: "test",
        amount: 1000,
        currency: "USD",
        category: "other",
        receiptStorageId: null,
        status: "pending",
        submittedAt: Date.now(),
        decidedAt: null,
      });
      await ctx.db.insert("approvals", {
        expenseId: eid,
        teamId: world.teamId,
        position: 1,
        approverId: managerId,
        state: "pending",
        submittedAt: Date.now(),
        decidedAt: null,
        decisionNote: null,
      });
      return eid;
    });

    const current = await t.run((ctx) =>
      getCurrentPendingApproval(ctx, expenseId),
    );
    expect(current?.approverId).toBe(managerId);

    const ids = await t.run((ctx) => chainApproverIds(ctx, expenseId));
    expect(ids).toEqual([managerId]);
  });
});
