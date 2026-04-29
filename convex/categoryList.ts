/**
 * Fixed global expense category list. Per-team categories are deferred
 * to a future version (see PLAN.md "Categories").
 *
 * Imported by both the server (validators in `expenses.ts`) and the
 * client (form select options).
 */
export const EXPENSE_CATEGORIES = [
  "travel",
  "meals",
  "lodging",
  "transportation",
  "supplies",
  "software",
  "training",
  "client_entertainment",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  travel: "Travel",
  meals: "Meals",
  lodging: "Lodging",
  transportation: "Transportation",
  supplies: "Supplies",
  software: "Software",
  training: "Training",
  client_entertainment: "Client entertainment",
  other: "Other",
};
