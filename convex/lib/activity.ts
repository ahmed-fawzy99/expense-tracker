import { Id } from "../_generated/dataModel";
import { MutationCtx } from "../_generated/server";

/**
 * Per-event property shapes. The activity log's `properties` field is
 * `v.any()` at the schema level (escape hatch); these TypeScript types
 * narrow it at each call site so the data shape stays consistent.
 */
type ExpenseSubmittedProps = {
  managerId: Id<"users">;
};
type ExpenseApprovedProps = {
  byApproverId: Id<"users">;
  position: number;
};
type ExpenseRejectedProps = {
  byApproverId: Id<"users">;
  position: number;
  note: string;
};
type ExpenseChainExtendedProps = {
  byApproverId: Id<"users">;
  nextApproverId: Id<"users">;
  position: number;
};
type ExpenseResubmittedProps = {
  managerId: Id<"users">;
  // Note from the most recent rejected approval step. Denormalized so the
  // owner-filtered timeline renders without a second lookup.
  previousRejectionNote: string;
};
type ExpenseStatusChangedProps = {
  from: "draft" | "pending" | "approved" | "rejected";
  to: "draft" | "pending" | "approved" | "rejected";
};
type UserCreatedProps = {
  email: string;
  createdRole: string | null;
};
type UserRoleAssignedProps = {
  roleId: Id<"roles">;
  roleName: string;
};

type ExpenseLogArgs =
  | { event: "submitted"; properties: ExpenseSubmittedProps }
  | { event: "approved"; properties: ExpenseApprovedProps }
  | { event: "rejected"; properties: ExpenseRejectedProps }
  | { event: "chain_extended"; properties: ExpenseChainExtendedProps }
  | { event: "resubmitted"; properties: ExpenseResubmittedProps }
  | { event: "status_changed"; properties: ExpenseStatusChangedProps };

type UserLogArgs =
  | { event: "user.created"; properties: UserCreatedProps }
  | { event: "role.assigned"; properties: UserRoleAssignedProps };

type LogArgs = {
  teamId: Id<"teams">;
  causerId: Id<"users"> | null;
  description: string;
} & (
  | ({ subjectType: "expenses"; subjectId: Id<"expenses"> } & ExpenseLogArgs)
  | ({ subjectType: "users"; subjectId: Id<"users"> } & UserLogArgs)
);

/**
 * Single insertion point for activity log rows. Must be called in the SAME
 * transaction as the mutation that produced the change.
 */
export async function log(
  ctx: MutationCtx,
  args: LogArgs,
): Promise<Id<"activityLog">> {
  return await ctx.db.insert("activityLog", args);
}
