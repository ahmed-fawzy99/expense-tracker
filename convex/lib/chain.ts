import { ConvexError } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { PERMISSIONS, ROLES } from "./authConstants";

const APPROVE_PERMISSION = PERMISSIONS.expensesApprove;
const ADMIN_ROLE_NAME = ROLES.admin;

/**
 * Forward-resolves users in the given team who can act as approvers.
 *
 * Algorithm (per PLAN.md "Chain-eligibility resolution"):
 *   1. permissions.byName -> permissionId for "expenses.approve"
 *   2. rolePermissions.byPermission -> set of roleIds that grant it
 *   3. userRoles.byRoleAndTeam -> users in this team who hold those roles
 *   4. dedupe, drop submitter, drop already-in-chain users
 *
 * The admin role is included even if it doesn't have the permission row
 * (admin is treated as an implicit super-permission everywhere).
 */
export async function eligibleApprovers(
  ctx: QueryCtx | MutationCtx,
  args: {
    teamId: Id<"teams">;
    submitterId: Id<"users">;
    existingApproverIds: ReadonlyArray<Id<"users">>;
  },
): Promise<Doc<"users">[]> {
  const approvePerm = await ctx.db
    .query("permissions")
    .withIndex("by_name", (q) => q.eq("name", APPROVE_PERMISSION))
    .unique();

  const roleIds = new Set<Id<"roles">>();

  if (approvePerm) {
    const rolePerms = await ctx.db
      .query("rolePermissions")
      .withIndex("by_permission", (q) => q.eq("permissionId", approvePerm._id))
      .take(500);
    for (const rp of rolePerms) {
      roleIds.add(rp.roleId);
    }
  }

  const adminRole = await ctx.db
    .query("roles")
    .withIndex("by_name", (q) => q.eq("name", ADMIN_ROLE_NAME))
    .unique();
  if (adminRole) {
    roleIds.add(adminRole._id);
  }

  const userIds = new Set<Id<"users">>();
  for (const roleId of roleIds) {
    const memberships = await ctx.db
      .query("userRoles")
      .withIndex("by_role_and_team", (q) =>
        q.eq("roleId", roleId).eq("teamId", args.teamId),
      )
      .take(1000);
    for (const m of memberships) {
      userIds.add(m.userId);
    }
  }

  userIds.delete(args.submitterId);
  for (const id of args.existingApproverIds) {
    userIds.delete(id);
  }

  const users = await Promise.all(
    [...userIds].map((id) => ctx.db.get("users", id)),
  );
  return users.filter((u): u is Doc<"users"> => u !== null);
}

/**
 * Returns the current pending approval row for an expense (≤ 1 by invariant),
 * or null if the chain has no pending step.
 */
export async function getCurrentPendingApproval(
  ctx: QueryCtx | MutationCtx,
  expenseId: Id<"expenses">,
): Promise<Doc<"approvals"> | null> {
  const all = await ctx.db
    .query("approvals")
    .withIndex("by_expense", (q) => q.eq("expenseId", expenseId))
    .collect();
  const pending = all.filter((a) => a.state === "pending");
  if (pending.length === 0) return null;
  if (pending.length > 1) {
    throw new ConvexError("Invariant violated: multiple pending approval steps");
  }
  return pending[0];
}

/**
 * Returns all approver ids that have ever appeared in an expense's chain
 * (any state). Used for chain-extension duplicate guard.
 */
export async function chainApproverIds(
  ctx: QueryCtx | MutationCtx,
  expenseId: Id<"expenses">,
): Promise<Id<"users">[]> {
  const rows = await ctx.db
    .query("approvals")
    .withIndex("by_expense", (q) => q.eq("expenseId", expenseId))
    .collect();
  return rows.map((r) => r.approverId);
}

/**
 * Asserts a candidate approver can be added to the chain.
 * Throws if the candidate is the submitter, or already in the chain.
 */
export function assertCanAddApprover(args: {
  candidateId: Id<"users">;
  submitterId: Id<"users">;
  existingApproverIds: ReadonlyArray<Id<"users">>;
}): void {
  if (args.candidateId === args.submitterId) {
    throw new ConvexError("Cannot add the submitter as an approver");
  }
  if (args.existingApproverIds.includes(args.candidateId)) {
    throw new ConvexError("User is already in the approval chain");
  }
}

/**
 * Returns the next position in a chain (1-indexed).
 */
export function nextPosition(chainLength: number): number {
  return chainLength + 1;
}
