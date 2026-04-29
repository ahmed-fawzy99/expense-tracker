/// <reference types="vite/client" />
/**
 * Shared world-setup helpers for `convex-test`. NOT exposed as Convex
 * functions — this module contains only helper functions imported by
 * `*.test.ts` files. It lives inside `convex/` so it can use the same
 * generated types.
 *
 * Note: convex-test discovers function modules via `import.meta.glob` in
 * each test file. Modules without registered functions (like this one)
 * are silently skipped.
 */
import { convexTest } from "convex-test";
import schema from "../schema";
import { Id } from "../_generated/dataModel";
import {
  PERMISSIONS as PERM,
  ROLES,
  ALL_PERMISSION_NAMES,
  type PermissionName,
  type RoleName,
} from "../lib/authConstants";

const modules = import.meta.glob("../**/*.ts");

export function makeT() {
  return convexTest(schema, modules);
}

const PERMISSION_NAMES: readonly PermissionName[] = ALL_PERMISSION_NAMES;

const ROLE_GRANTS: Record<RoleName, ReadonlyArray<PermissionName>> = {
  [ROLES.admin]: PERMISSION_NAMES,
  [ROLES.manager]: [
    PERM.expensesCreate,
    PERM.expensesReadOwn,
    PERM.expensesApprove,
    PERM.activityReadFull,
  ],
  [ROLES.employee]: [PERM.expensesCreate, PERM.expensesReadOwn],
};

export type World = {
  teamId: Id<"teams">;
  otherTeamId: Id<"teams">;
  roles: Record<string, Id<"roles">>;
  permissions: Record<string, Id<"permissions">>;
};

/**
 * Inserts permissions, roles, role-permission grants, and two teams.
 */
export async function seedRolesAndTeams(
  t: ReturnType<typeof convexTest>,
): Promise<World> {
  return await t.run(async (ctx) => {
    const permissions: Record<string, Id<"permissions">> = {};
    for (const name of PERMISSION_NAMES) {
      permissions[name] = await ctx.db.insert("permissions", {
        name,
        description: null,
      });
    }
    const roles: Record<string, Id<"roles">> = {};
    for (const [name, grants] of Object.entries(ROLE_GRANTS)) {
      roles[name] = await ctx.db.insert("roles", {
        name,
        description: null,
        permissionNames: [...grants],
      });
    }
    for (const [roleName, perms] of Object.entries(ROLE_GRANTS)) {
      for (const permName of perms) {
        await ctx.db.insert("rolePermissions", {
          roleId: roles[roleName],
          permissionId: permissions[permName],
        });
      }
    }
    const teamId = await ctx.db.insert("teams", {
      name: "HQ",
      defaultCurrency: "USD",
    });
    const otherTeamId = await ctx.db.insert("teams", {
      name: "Branch",
      defaultCurrency: "EUR",
    });
    return { teamId, otherTeamId, roles, permissions };
  });
}

/**
 * Creates a user row directly (bypassing Convex Auth) and assigns roles.
 * Returns the user's id and a `subject` string suitable for
 * `t.withIdentity({ subject })` so the `getAuthUserId` helper resolves it.
 *
 * Note: convex-test's identity provider has its own getAuthUserId
 * compatibility; the `subject` we return here is the user id, which
 * Convex Auth parses out of the JWT subject claim.
 */
export async function makeUser(
  t: ReturnType<typeof convexTest>,
  args: {
    email: string;
    name?: string;
    teamId: Id<"teams">;
    managerId: Id<"users"> | null;
    roleIds: Id<"roles">[];
  },
): Promise<{ userId: Id<"users">; subject: string }> {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      email: args.email,
      name: args.name ?? args.email.split("@")[0],
      teamId: args.teamId,
      managerId: args.managerId,
      createdBy: null,
    });
    for (const roleId of args.roleIds) {
      await ctx.db.insert("userRoles", {
        userId: id,
        roleId,
        teamId: args.teamId,
        assignedBy: null,
        assignedAt: Date.now(),
      });
    }
    return id;
  });
  // Convex Auth parses identity.subject as `${userId}|${sessionId}`.
  return { userId, subject: `${userId}|test-session` };
}

/**
 * Sugar: creates a user and returns a function bound to `t.withIdentity(...)`
 * for that user. Lets tests do `as.alex.mutation(api.x, ...)`.
 */
export function asIdentity(
  t: ReturnType<typeof convexTest>,
  subject: string,
): ReturnType<typeof t.withIdentity> {
  return t.withIdentity({ subject });
}

/**
 * Stores a blob in convex-test storage and patches the contentType into
 * the `_storage` system table. Necessary because convex-test's
 * `ctx.storage.store(blob)` does NOT preserve `blob.type` (vs. real
 * Convex). This helper lets receipt-validation tests cover real MIME paths.
 */
export async function storeReceiptForTest(
  t: ReturnType<typeof convexTest>,
  args: { bytes: number; contentType: string },
): Promise<Id<"_storage">> {
  const blob = new Blob([new Uint8Array(args.bytes)], {
    type: args.contentType,
  });
  const storageId = await t.run((ctx) => ctx.storage.store(blob));
  // convex-test stores `_storage` as a regular table internally, so we
  // can patch it. We cast through `unknown` to bypass schema typing.
  await t.run(async (ctx) => {
    const dbAny = ctx.db as unknown as {
      patch: (id: Id<"_storage">, fields: { contentType: string }) => Promise<void>;
    };
    await dbAny.patch(storageId, { contentType: args.contentType });
  });
  return storageId;
}
