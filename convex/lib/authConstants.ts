/**
 * Pure constants for permission and role names. Single source of truth,
 * safe to import from both server (`convex/*`) and client (`src/*`) — this
 * file has zero server-only dependencies.
 *
 * Always reference these constants instead of typing the literal strings.
 */
export const PERMISSIONS = {
  expensesCreate: "expenses.create",
  expensesReadOwn: "expenses.read.own",
  expensesReadTeam: "expenses.read.team",
  expensesApprove: "expenses.approve",
  usersManage: "users.manage",
  teamManage: "team.manage",
  activityReadFull: "activity.read.full",
} as const;

export type PermissionName = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_NAMES: readonly PermissionName[] =
  Object.values(PERMISSIONS);

export const ROLES = {
  admin: "admin",
  manager: "manager",
  employee: "employee",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLE_NAMES: readonly RoleName[] = Object.values(ROLES);
