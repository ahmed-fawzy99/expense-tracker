export const EXPENSE_STATUSES = [
  "draft",
  "pending",
  "approved",
  "rejected",
] as const;

export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const STATUS_LABEL: Record<ExpenseStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

/**
 * Maps a status to a shadcn `<Badge>` variant. The component owns the
 * color mapping so individual call-sites never reach for raw colors.
 */
export const STATUS_VARIANT: Record<ExpenseStatus, "secondary" | "default" | "destructive" | "outline"> = {
  draft: "secondary",
  pending: "outline",
  approved: "default",
  rejected: "destructive",
};
