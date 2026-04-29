import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { log } from "./lib/activity";
import {
  PERMISSIONS as PERM,
  PermissionName,
  ROLES,
  RoleName,
} from "./lib/permissions";

// ---------------------------------------------------------------------
// Catalogs (kept here, not in PLAN.md, so seed is the single source for v1).
// ---------------------------------------------------------------------

const PERMISSION_CATALOG: ReadonlyArray<readonly [PermissionName, string]> = [
  [PERM.expensesCreate, "Submit own expenses (drafts + submit)"],
  [PERM.expensesReadOwn, "Read one's own expenses + their activity log"],
  [PERM.expensesApprove, "Eligible to appear as an approver"],
  [PERM.expensesReadTeam, "Read all expenses across own team"],
  [PERM.usersManage, "Create users, set roles, assign managers"],
  [PERM.teamManage, "Edit team settings"],
  [PERM.activityReadFull, "Read full activity log for any same-team subject"],
];

const ROLE_GRANTS: Record<RoleName, ReadonlyArray<PermissionName>> = {
  [ROLES.admin]: PERMISSION_CATALOG.map(([n]) => n),
  [ROLES.manager]: [
    PERM.expensesCreate,
    PERM.expensesReadOwn,
    PERM.expensesApprove,
    PERM.activityReadFull,
  ],
  [ROLES.employee]: [PERM.expensesCreate, PERM.expensesReadOwn],
};

const SAMPLE_TEAM = { name: "HQ", defaultCurrency: "USD" };

const PASSWORD = "password";

const SAMPLE_MANAGER = {
  email: "super@root.test",
  password: PASSWORD,
  name: "Super Manager",
};

const SAMPLE_EMPLOYEES = [
  { email: "vlad@airdev.test", password: PASSWORD, name: "Vlad" },
  {
    email: "employee+1@airdev.test",
    password: PASSWORD,
    name: "Blair Banerjee",
  },
  { email: "employee+2@airdev.test", password: PASSWORD, name: "Casey Cho" },
  { email: "employee+3@airdev.test", password: PASSWORD, name: "Dana Diallo" },
];

// ---------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------

export const _ensureRolesAndTeam = internalMutation({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    teamId: Id<"teams">;
    managerRoleId: Id<"roles">;
    employeeRoleId: Id<"roles">;
    adminRoleId: Id<"roles">;
  }> => {
    // Permissions (idempotent)
    const permIds: Record<string, Id<"permissions">> = {};
    for (const [name, description] of PERMISSION_CATALOG) {
      const existing = await ctx.db
        .query("permissions")
        .withIndex("by_name", (q) => q.eq("name", name))
        .unique();
      permIds[name] = existing
        ? existing._id
        : await ctx.db.insert("permissions", { name, description });
    }

    // Roles (idempotent). `permissionNames` is a denormalized cache of the
    // role's grants, read by `permissionsFor` to avoid the rolePermissions join.
    const roleIds: Record<string, Id<"roles">> = {};
    for (const [roleName, grants] of Object.entries(ROLE_GRANTS)) {
      const permissionNames = [...grants];
      const existing = await ctx.db
        .query("roles")
        .withIndex("by_name", (q) => q.eq("name", roleName))
        .unique();
      if (existing) {
        const stale =
          existing.permissionNames.length !== permissionNames.length ||
          !permissionNames.every((n) => existing.permissionNames.includes(n));
        if (stale) {
          await ctx.db.patch("roles", existing._id, { permissionNames });
        }
        roleIds[roleName] = existing._id;
      } else {
        roleIds[roleName] = await ctx.db.insert("roles", {
          name: roleName,
          description: null,
          permissionNames,
        });
      }
    }

    // Role permissions (idempotent)
    for (const [roleName, perms] of Object.entries(ROLE_GRANTS)) {
      const roleId = roleIds[roleName];
      for (const permName of perms) {
        const permId = permIds[permName];
        const existing = await ctx.db
          .query("rolePermissions")
          .withIndex("by_role_and_permission", (q) =>
            q.eq("roleId", roleId).eq("permissionId", permId),
          )
          .unique();
        if (!existing) {
          await ctx.db.insert("rolePermissions", {
            roleId,
            permissionId: permId,
          });
        }
      }
    }

    // Team
    const existingTeam = await ctx.db.query("teams").take(1);
    const teamId: Id<"teams"> =
      existingTeam.length > 0
        ? existingTeam[0]._id
        : await ctx.db.insert("teams", SAMPLE_TEAM);

    return {
      teamId,
      managerRoleId: roleIds.manager,
      employeeRoleId: roleIds.employee,
      adminRoleId: roleIds.admin,
    };
  },
});

export const _assignRoleAndManager = internalMutation({
  args: {
    userId: v.id("users"),
    teamId: v.id("teams"),
    roleId: v.id("roles"),
    managerId: v.union(v.id("users"), v.null()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("users", args.userId, { managerId: args.managerId });

    const existing = await ctx.db
      .query("userRoles")
      .withIndex("by_user_and_role_and_team", (q) =>
        q
          .eq("userId", args.userId)
          .eq("roleId", args.roleId)
          .eq("teamId", args.teamId),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("userRoles", {
        userId: args.userId,
        roleId: args.roleId,
        teamId: args.teamId,
        assignedBy: null,
        assignedAt: Date.now(),
      });
    }
  },
});

export const _hasSampleExpenses = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const any = await ctx.db
      .query("expenses")
      .withIndex("by_team_and_status", (q) => q.eq("teamId", args.teamId))
      .take(1);
    return any.length > 0;
  },
});

export const _seedSampleExpenses = internalMutation({
  args: {
    teamId: v.id("teams"),
    managerId: v.id("users"),
    employeeIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const usd = (cents: number) => cents;

    const samples: Array<{
      submitterIdx: number;
      description: string;
      amount: number;
      category: string;
      status: "draft" | "pending" | "approved" | "rejected";
      submittedDelta: number; // ms ago for `submittedAt`
      decidedDelta: number | null;
      decisionNote: string | null;
    }> = [
      {
        submitterIdx: 0,
        description: "Coffee chat with potential client",
        amount: usd(2400),
        category: "client_entertainment",
        status: "draft",
        submittedDelta: 0,
        decidedDelta: null,
        decisionNote: null,
      },
      {
        submitterIdx: 1,
        description: "USB-C dock for home office",
        amount: usd(8900),
        category: "supplies",
        status: "draft",
        submittedDelta: 0,
        decidedDelta: null,
        decisionNote: null,
      },
      {
        submitterIdx: 0,
        description: "Flight to client kickoff (NYC)",
        amount: usd(45200),
        category: "travel",
        status: "pending",
        submittedDelta: 1 * day,
        decidedDelta: null,
        decisionNote: null,
      },
      {
        submitterIdx: 2,
        description: "Hotel — 2 nights, conference",
        amount: usd(38000),
        category: "lodging",
        status: "pending",
        submittedDelta: 2 * day,
        decidedDelta: null,
        decisionNote: null,
      },
      {
        submitterIdx: 3,
        description: "Team lunch (5 people)",
        amount: usd(12450),
        category: "meals",
        status: "approved",
        submittedDelta: 6 * day,
        decidedDelta: 5 * day,
        decisionNote: null,
      },
      {
        submitterIdx: 1,
        description: "Annual JetBrains license",
        amount: usd(24900),
        category: "software",
        status: "approved",
        submittedDelta: 10 * day,
        decidedDelta: 9 * day,
        decisionNote: null,
      },
      {
        submitterIdx: 2,
        description: "Uber to airport — 4 AM (no receipt)",
        amount: usd(8200),
        category: "transportation",
        status: "rejected",
        submittedDelta: 3 * day,
        decidedDelta: 2 * day,
        decisionNote: "Missing receipt photo — please resubmit with proof.",
      },
      {
        submitterIdx: 3,
        description: "Online course: Advanced Convex Patterns",
        amount: usd(14900),
        category: "training",
        status: "approved",
        submittedDelta: 14 * day,
        decidedDelta: 13 * day,
        decisionNote: null,
      },
    ];

    for (const s of samples) {
      const submitterId = args.employeeIds[s.submitterIdx];
      const submittedAt = s.status === "draft" ? null : now - s.submittedDelta;
      const decidedAt = s.decidedDelta === null ? null : now - s.decidedDelta;

      const expenseId = await ctx.db.insert("expenses", {
        teamId: args.teamId,
        submitterId,
        description: s.description,
        amount: s.amount,
        currency: "USD",
        category: s.category,
        receiptStorageId: null, // Seeded data has no real receipt blob.
        status: s.status,
        submittedAt,
        decidedAt,
      });

      if (s.status === "draft") continue;

      // Every non-draft sample has an approval row at the manager.
      const approvalState =
        s.status === "approved"
          ? "approved"
          : s.status === "rejected"
            ? "rejected"
            : "pending";

      await ctx.db.insert("approvals", {
        expenseId,
        teamId: args.teamId,
        position: 1,
        approverId: args.managerId,
        state: approvalState,
        submittedAt: submittedAt ?? Date.now(),
        decidedAt: approvalState === "pending" ? null : decidedAt,
        decisionNote: s.decisionNote,
      });

      // Activity log for the submitted event.
      await log(ctx, {
        subjectType: "expenses",
        subjectId: expenseId,
        teamId: args.teamId,
        causerId: submitterId,
        event: "submitted",
        description: "Submitted for approval",
        properties: { managerId: args.managerId },
      });

      if (s.status === "approved") {
        await log(ctx, {
          subjectType: "expenses",
          subjectId: expenseId,
          teamId: args.teamId,
          causerId: args.managerId,
          event: "approved",
          description: "Approved",
          properties: { byApproverId: args.managerId, position: 1 },
        });
        await log(ctx, {
          subjectType: "expenses",
          subjectId: expenseId,
          teamId: args.teamId,
          causerId: args.managerId,
          event: "status_changed",
          description: "Status: pending → approved",
          properties: { from: "pending", to: "approved" },
        });
      } else if (s.status === "rejected") {
        await log(ctx, {
          subjectType: "expenses",
          subjectId: expenseId,
          teamId: args.teamId,
          causerId: args.managerId,
          event: "rejected",
          description: `Rejected: ${s.decisionNote ?? ""}`,
          properties: {
            byApproverId: args.managerId,
            position: 1,
            note: s.decisionNote ?? "",
          },
        });
        await log(ctx, {
          subjectType: "expenses",
          subjectId: expenseId,
          teamId: args.teamId,
          causerId: args.managerId,
          event: "status_changed",
          description: "Status: pending → rejected",
          properties: { from: "pending", to: "rejected" },
        });
      }
    }
  },
});

// ---------------------------------------------------------------------
// Wipe — used by `runFresh` to drop every domain + auth row before reseeding.
// Each batch is bounded so we never hit Convex's per-mutation document limit.
// ---------------------------------------------------------------------

const WIPE_TABLES = [
  // Domain (children before parents to keep things tidy in logs).
  "notifications",
  "activityLog",
  "approvals",
  "expenses",
  "userRoles",
  "rolePermissions",
  "permissions",
  "roles",
  "teams",
  // Auth + auth-extended `users`.
  "authVerificationCodes",
  "authVerifiers",
  "authRefreshTokens",
  "authSessions",
  "authAccounts",
  "users",
] as const;

type WipeTable = (typeof WIPE_TABLES)[number];

const WIPE_BATCH = 256;

export const _wipeBatch = internalMutation({
  args: { table: v.string() },
  handler: async (ctx, args): Promise<{ deleted: number; done: boolean }> => {
    if (!(WIPE_TABLES as ReadonlyArray<string>).includes(args.table)) {
      throw new Error(`Refusing to wipe unknown table: ${args.table}`);
    }
    const table = args.table as WipeTable;
    const rows = await ctx.db.query(table).take(WIPE_BATCH);
    for (const row of rows) {
      await ctx.db.delete(table, row._id);
    }
    return { deleted: rows.length, done: rows.length < WIPE_BATCH };
  },
});

export const _wipeStorageBatch = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: number; done: boolean }> => {
    const rows = await ctx.db.system.query("_storage").take(WIPE_BATCH);
    for (const row of rows) {
      await ctx.storage.delete(row._id);
    }
    return { deleted: rows.length, done: rows.length < WIPE_BATCH };
  },
});

// ---------------------------------------------------------------------
// Public entry point: orchestrates the full bootstrap sequence.
// Idempotent — safe to re-run.
// ---------------------------------------------------------------------

type SeedResult = {
  manager: { email: string; password: string; userId: Id<"users"> };
  employees: Array<{ email: string; password: string; userId: Id<"users"> }>;
};

export const run = action({
  args: {
    // When true, wipes every domain + auth row (and storage blobs) before
    // reseeding. Equivalent in spirit to Laravel's `php artisan migrate:fresh
    // --seed`. Dev-only — never run against production data.
    fresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<SeedResult> => {
    if (args.fresh) {
      console.log("⚠️  --fresh set: wiping database before reseeding…");
      for (const table of WIPE_TABLES) {
        let total = 0;
        // Each batch is its own transaction; loop until the table is empty.
        // Bounded by WIPE_BATCH to stay well under per-mutation doc limits.
        while (true) {
          const { deleted, done } = await ctx.runMutation(
            internal.seed._wipeBatch,
            { table },
          );
          total += deleted;
          if (done) break;
        }
        if (total > 0) console.log(`  cleared ${total} rows from ${table}`);
      }
      let storageTotal = 0;
      while (true) {
        const { deleted, done } = await ctx.runMutation(
          internal.seed._wipeStorageBatch,
          {},
        );
        storageTotal += deleted;
        if (done) break;
      }
      if (storageTotal > 0) {
        console.log(`  cleared ${storageTotal} storage blobs`);
      }
      console.log("✓ Database wiped. Reseeding…\n");
    }

    const { teamId, managerRoleId, employeeRoleId } = await ctx.runMutation(
      internal.seed._ensureRolesAndTeam,
      {},
    );

    // Manager
    const managerId: Id<"users"> = await ctx.runAction(
      internal.users.createUserInternal,
      {
        email: SAMPLE_MANAGER.email,
        password: SAMPLE_MANAGER.password,
        name: SAMPLE_MANAGER.name,
        teamId,
        managerId: null,
        createdBy: null,
      },
    );
    await ctx.runMutation(internal.seed._assignRoleAndManager, {
      userId: managerId,
      teamId,
      roleId: managerRoleId,
      managerId: null,
    });

    // Employees
    const employeeIds: Id<"users">[] = [];
    for (const emp of SAMPLE_EMPLOYEES) {
      const id: Id<"users"> = await ctx.runAction(
        internal.users.createUserInternal,
        {
          email: emp.email,
          password: emp.password,
          name: emp.name,
          teamId,
          managerId,
          createdBy: null,
        },
      );
      await ctx.runMutation(internal.seed._assignRoleAndManager, {
        userId: id,
        teamId,
        roleId: employeeRoleId,
        managerId,
      });
      employeeIds.push(id);
    }

    // Sample expenses (only seed once)
    const alreadyHasExpenses = await ctx.runQuery(
      internal.seed._hasSampleExpenses,
      { teamId },
    );
    if (!alreadyHasExpenses) {
      await ctx.runMutation(internal.seed._seedSampleExpenses, {
        teamId,
        managerId,
        employeeIds,
      });
    }

    const result: SeedResult = {
      manager: {
        email: SAMPLE_MANAGER.email,
        password: SAMPLE_MANAGER.password,
        userId: managerId,
      },
      employees: SAMPLE_EMPLOYEES.map((emp, i) => ({
        email: emp.email,
        password: emp.password,
        userId: employeeIds[i],
      })),
    };

    console.log("\n========= EXPENSE TRACKER SEED RESULTS =========");
    console.log(
      `Manager: ${result.manager.email} / ${result.manager.password}`,
    );
    for (const emp of result.employees) {
      console.log(`Employee: ${emp.email} / ${emp.password}`);
    }
    console.log("================================================\n");

    return result;
  },
});
