import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

/**
 * Convex schema for the expense tracker.
 *
 * Naming convention (deliberate house-style override of Convex's docs default):
 * - All field names are camelCase.
 * - All index names are camelCase (e.g. `byTeamAndStatus`).
 * - The Convex AI guidelines recommend `snake_case`; we override that here.
 *   See `convex/CLAUDE.md` for the rationale.
 *
 * Money: `amount` is stored as integer minor units (no FX conversion).
 * Uniqueness: Convex indexes are NOT unique. All "(unique)" fields are
 * app-enforced inside their create mutation via `withIndex(...).unique()`-then-throw.
 */
export default defineSchema({
  // -----------------------------------------------------------------
  // Auth — owned by @convex-dev/auth's authTables.
  // The `users` table below extends authTables.users with domain fields.
  // -----------------------------------------------------------------
  ...authTables,

  users: defineTable({
    ...authTables.users.validator.fields,
    teamId: v.id("teams"),
    managerId: v.union(v.id("users"), v.null()),
    createdBy: v.union(v.id("users"), v.null()),
  })
    .index("email", ["email"])
    .index("by_team", ["teamId"])
    .index("by_team_and_manager", ["teamId", "managerId"]),

  // -----------------------------------------------------------------
  // Teams (branch / office identifier — see PLAN.md "Localization deferred")
  // -----------------------------------------------------------------
  teams: defineTable({
    name: v.string(),
    defaultCurrency: v.string(),
  }),

  // -----------------------------------------------------------------
  // Roles & permissions (Spatie-inspired)
  // -----------------------------------------------------------------
  roles: defineTable({
    name: v.string(),
    description: v.union(v.string(), v.null()),
    permissionNames: v.array(v.string()),
  }).index("by_name", ["name"]),

  permissions: defineTable({
    name: v.string(),
    description: v.union(v.string(), v.null()),
  }).index("by_name", ["name"]),

  rolePermissions: defineTable({
    roleId: v.id("roles"),
    permissionId: v.id("permissions"),
  })
    .index("by_role", ["roleId"])
    .index("by_permission", ["permissionId"])
    .index("by_role_and_permission", ["roleId", "permissionId"]),

  userRoles: defineTable({
    userId: v.id("users"),
    roleId: v.id("roles"),
    teamId: v.id("teams"),
    assignedBy: v.union(v.id("users"), v.null()),
    assignedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_role_and_team", ["userId", "roleId", "teamId"])
    .index("by_team_and_role", ["teamId", "roleId"])
    .index("by_role_and_team", ["roleId", "teamId"]),

  // -----------------------------------------------------------------
  // Domain — expenses
  // -----------------------------------------------------------------
  expenses: defineTable({
    teamId: v.id("teams"),
    submitterId: v.id("users"),
    description: v.string(),
    amount: v.number(),
    currency: v.string(),
    category: v.string(),
    receiptStorageId: v.union(v.id("_storage"), v.null()),
    status: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    submittedAt: v.union(v.number(), v.null()),
    decidedAt: v.union(v.number(), v.null()),
  })
    .index("by_submitter_and_status", ["submitterId", "status"])
    .index("by_submitter_and_category", ["submitterId", "category"])
    .index("by_submitter_and_submitted_at", ["submitterId", "submittedAt"])
    .index("by_team_and_status", ["teamId", "status"])
    .index("by_team_and_category", ["teamId", "category"])
    .index("by_team_and_submitted_at", ["teamId", "submittedAt"]),

  // -----------------------------------------------------------------
  // Domain — approvals (chain steps; ≤ 1 pending at a time)
  // -----------------------------------------------------------------
  approvals: defineTable({
    expenseId: v.id("expenses"),
    teamId: v.id("teams"),
    position: v.number(),
    approverId: v.id("users"),
    state: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    // Denormalized from the parent expense at insert time. Lets the manager
    // dashboard order by submission date at the index level instead of
    // re-sorting paginated results in memory.
    submittedAt: v.number(),
    decidedAt: v.union(v.number(), v.null()),
    decisionNote: v.union(v.string(), v.null()),
  })
    .index("by_expense", ["expenseId"])
    .index("by_approver_and_state", ["approverId", "state"])
    .index("by_approver_and_decided_at", ["approverId", "decidedAt"])
    .index("by_approver_and_submitted_at", ["approverId", "submittedAt"])
    .index("by_approver_and_state_and_submitted_at", [
      "approverId",
      "state",
      "submittedAt",
    ]),

  // -----------------------------------------------------------------
  // Domain — activity log (polymorphic, table-level discriminated union)
  // -----------------------------------------------------------------
  activityLog: defineTable(
    v.union(
      // expenses — submitted
      v.object({
        subjectType: v.literal("expenses"),
        subjectId: v.id("expenses"),
        teamId: v.id("teams"),
        causerId: v.union(v.id("users"), v.null()),
        event: v.literal("submitted"),
        description: v.string(),
        properties: v.object({ managerId: v.id("users") }),
      }),
      // expenses — approved
      v.object({
        subjectType: v.literal("expenses"),
        subjectId: v.id("expenses"),
        teamId: v.id("teams"),
        causerId: v.union(v.id("users"), v.null()),
        event: v.literal("approved"),
        description: v.string(),
        properties: v.object({
          byApproverId: v.id("users"),
          position: v.number(),
        }),
      }),
      // expenses — rejected
      v.object({
        subjectType: v.literal("expenses"),
        subjectId: v.id("expenses"),
        teamId: v.id("teams"),
        causerId: v.union(v.id("users"), v.null()),
        event: v.literal("rejected"),
        description: v.string(),
        properties: v.object({
          byApproverId: v.id("users"),
          position: v.number(),
          note: v.string(),
        }),
      }),
      // expenses — chain_extended
      v.object({
        subjectType: v.literal("expenses"),
        subjectId: v.id("expenses"),
        teamId: v.id("teams"),
        causerId: v.union(v.id("users"), v.null()),
        event: v.literal("chain_extended"),
        description: v.string(),
        properties: v.object({
          byApproverId: v.id("users"),
          nextApproverId: v.id("users"),
          position: v.number(),
        }),
      }),
      // expenses — resubmitted
      v.object({
        subjectType: v.literal("expenses"),
        subjectId: v.id("expenses"),
        teamId: v.id("teams"),
        causerId: v.union(v.id("users"), v.null()),
        event: v.literal("resubmitted"),
        description: v.string(),
        properties: v.object({
          managerId: v.id("users"),
          previousRejectionNote: v.string(),
        }),
      }),
      // expenses — status_changed
      v.object({
        subjectType: v.literal("expenses"),
        subjectId: v.id("expenses"),
        teamId: v.id("teams"),
        causerId: v.union(v.id("users"), v.null()),
        event: v.literal("status_changed"),
        description: v.string(),
        properties: v.object({
          from: v.union(
            v.literal("draft"),
            v.literal("pending"),
            v.literal("approved"),
            v.literal("rejected"),
          ),
          to: v.union(
            v.literal("draft"),
            v.literal("pending"),
            v.literal("approved"),
            v.literal("rejected"),
          ),
        }),
      }),
      // users — user.created
      v.object({
        subjectType: v.literal("users"),
        subjectId: v.id("users"),
        teamId: v.id("teams"),
        causerId: v.union(v.id("users"), v.null()),
        event: v.literal("user.created"),
        description: v.string(),
        properties: v.object({
          email: v.string(),
          createdRole: v.union(v.string(), v.null()),
        }),
      }),
      // users — role.assigned
      v.object({
        subjectType: v.literal("users"),
        subjectId: v.id("users"),
        teamId: v.id("teams"),
        causerId: v.union(v.id("users"), v.null()),
        event: v.literal("role.assigned"),
        description: v.string(),
        properties: v.object({
          roleId: v.id("roles"),
          roleName: v.string(),
        }),
      }),
    ),
  )
    .index("by_subject", ["subjectType", "subjectId"])
    .index("by_team_and_created", ["teamId"])
    .index("by_causer", ["causerId"]),

  // -----------------------------------------------------------------
  // Rate limiting — sliding-window counter per (key, bucket)
  // `key` is e.g. `"changePassword:<userId>"`. `windowMs` is the start of the
  // window the row is anchored to. The helper increments `count` and rejects
  // when the count exceeds the configured limit for the window size.
  // -----------------------------------------------------------------
  rateLimits: defineTable({
    key: v.string(),
    windowStartMs: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),

  // -----------------------------------------------------------------
  // Domain — notifications (in-app only)
  // -----------------------------------------------------------------
  notifications: defineTable({
    userId: v.id("users"),
    teamId: v.id("teams"),
    type: v.union(
      v.literal("approval_requested"),
      v.literal("expense_decided"),
      v.literal("chain_extended"),
    ),
    subjectType: v.literal("expenses"),
    subjectId: v.id("expenses"),
    message: v.string(),
    readAt: v.union(v.number(), v.null()),
  })
    .index("by_user_and_unread", ["userId", "readAt"])
    .index("by_team_and_created", ["teamId"]),
});
