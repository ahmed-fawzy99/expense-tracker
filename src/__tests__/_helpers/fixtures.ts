import type { Id, Doc } from "../../../convex/_generated/dataModel";

const userId = "users_1" as Id<"users">;

export interface FakeMeOptions {
  permissions?: string[];
  email?: string;
  name?: string;
  managerId?: Id<"users"> | null;
}

/**
 * Returns a value matching the shape of `api.auth.getMe`'s success branch.
 * The hook signature uses `ReturnType<typeof useQuery>`, so we cast through
 * `unknown` here rather than re-deriving the type.
 */
export function fakeMe({
  permissions = [],
  email = "tester@example.com",
  name = "Test User",
  managerId = null,
}: FakeMeOptions = {}) {
  return {
    user: {
      _id: userId,
      name,
      email,
      teamId: "teams_1" as Id<"teams">,
      // Keep `null` distinct from `undefined` — the home route branches on
      // `managerId === null` to detect unmanaged users.
      managerId,
    },
    permissions,
  };
}

export function fakeExpense(
  overrides: Partial<Doc<"expenses">> = {},
): Doc<"expenses"> {
  return {
    _id: "expenses_1" as Id<"expenses">,
    _creationTime: 1_700_000_000_000,
    teamId: "teams_1" as Id<"teams">,
    submitterId: userId,
    description: "Lunch with client",
    amount: 1234,
    currency: "USD",
    category: "meals",
    status: "draft",
    receiptStorageId: null,
    chain: [],
    nextApproverId: null,
    submittedAt: null,
    decidedAt: null,
    rejectionReason: null,
    ...overrides,
  } as unknown as Doc<"expenses">;
}

export const TEST_USER_ID = userId;
