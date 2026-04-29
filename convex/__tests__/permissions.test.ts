/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { makeT, makeUser, seedRolesAndTeams } from "./testHelpers.utils";
import { permissionsFor } from "../lib/permissions";
import { PERMISSIONS as P } from "../lib/authConstants";

describe("permissionsFor", () => {
  test("returns empty set for a user with no role assignments", async () => {
    const t = makeT();
    const world = await seedRolesAndTeams(t);
    const { userId } = await makeUser(t, {
      email: "no-role@hq.test",
      teamId: world.teamId,
      managerId: null,
      roleIds: [],
    });
    const perms = await t.run(async (ctx) => {
      const user = await ctx.db.get("users", userId);
      if (!user) throw new Error("user missing");
      return [...(await permissionsFor(ctx, user))];
    });
    expect(perms).toEqual([]);
  });

  test("returns the union of role-permissions for a regular user", async () => {
    const t = makeT();
    const world = await seedRolesAndTeams(t);
    const { userId } = await makeUser(t, {
      email: "mgr@hq.test",
      teamId: world.teamId,
      managerId: null,
      roleIds: [world.roles.manager],
    });
    const perms = await t.run(async (ctx) => {
      const user = await ctx.db.get("users", userId);
      if (!user) throw new Error("user missing");
      return [...(await permissionsFor(ctx, user))].sort();
    });
    expect(perms).toEqual(
      [
        P.activityReadFull,
        P.expensesApprove,
        P.expensesCreate,
        P.expensesReadOwn,
      ].sort(),
    );
  });

  test("admin role short-circuits to ALL permissions", async () => {
    const t = makeT();
    const world = await seedRolesAndTeams(t);
    const { userId } = await makeUser(t, {
      email: "admin@hq.test",
      teamId: world.teamId,
      managerId: null,
      roleIds: [world.roles.admin],
    });
    const perms = await t.run(async (ctx) => {
      const user = await ctx.db.get("users", userId);
      if (!user) throw new Error("user missing");
      return [...(await permissionsFor(ctx, user))].sort();
    });
    // Admin gets every seeded permission.
    expect(perms).toEqual(
      [
        P.activityReadFull,
        P.expensesApprove,
        P.expensesCreate,
        P.expensesReadOwn,
        P.expensesReadTeam,
        P.teamManage,
        P.usersManage,
      ].sort(),
    );
  });

  test("dedupes when the same permission is granted via multiple roles", async () => {
    const t = makeT();
    const world = await seedRolesAndTeams(t);
    const { userId } = await makeUser(t, {
      email: "two-roles@hq.test",
      teamId: world.teamId,
      managerId: null,
      // employee + manager both grant `expenses.create` and `expenses.read.own`
      roleIds: [world.roles.employee, world.roles.manager],
    });
    const perms = await t.run(async (ctx) => {
      const user = await ctx.db.get("users", userId);
      if (!user) throw new Error("user missing");
      return [...(await permissionsFor(ctx, user))].sort();
    });
    expect(perms).toEqual(
      [
        P.activityReadFull,
        P.expensesApprove,
        P.expensesCreate,
        P.expensesReadOwn,
      ].sort(),
    );
  });
});
