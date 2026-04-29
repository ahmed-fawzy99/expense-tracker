import { Password } from "@convex-dev/auth/providers/Password";
import {
  convexAuth,
  getAuthUserId,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { permissionsFor } from "./lib/permissions";
import { enforceRateLimit } from "./lib/rateLimit";

/**
 * Convex Auth wiring. The Password provider is configured with a `profile`
 * that hard-rejects any sign-up attempt at the provider level — the only
 * path that creates accounts is `users.createUserInternal` (used by seed and
 * future admin tooling). This is defense-in-depth on top of schema validation.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        if (params.flow === "signUp") {
          throw new ConvexError("Public registration is disabled");
        }
        return { email: params.email as string };
      },
    }),
  ],
});

/**
 * Returns the caller's user row + permission set, or null if unauthenticated.
 * Single source of truth for the client's `useMe()` hook.
 */
export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get("users", userId);
    if (!user) return null;
    const perms = await permissionsFor(ctx, user);
    return {
      user: {
        _id: user._id,
        name: user.name ?? null,
        email: user.email ?? null,
        teamId: user.teamId,
        managerId: user.managerId,
      },
      permissions: [...perms],
    };
  },
});

// ---------------------------------------------------------------------
// Password change (authenticated user changes their own password).
// ---------------------------------------------------------------------

const GENERIC_AUTH_ERROR =
  "These credentials don't match our records.";

/**
 * Internal rate-limit check, callable from actions. Throws on exceed.
 */
export const _enforceRateLimit = internalMutation({
  args: {
    key: v.string(),
    windowMs: v.number(),
    max: v.number(),
  },
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, args);
  },
});

export const _getMyAccountIdentifier = internalQuery({
  args: {},
  handler: async (ctx): Promise<{ email: string } | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user: Doc<"users"> | null = await ctx.db.get("users", userId);
    if (!user || !user.email) return null;
    return { email: user.email };
  },
});

const PASSWORD_RULES = "Min 8 chars with at least one upper, lower, and digit.";

function validatePasswordOrThrow(password: string): void {
  if (
    password.length < 8 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    throw new ConvexError(PASSWORD_RULES);
  }
}

export const changePassword = action({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const account = await ctx.runQuery(
      internal.auth._getMyAccountIdentifier,
      {},
    );
    if (!account) {
      throw new ConvexError("Not authenticated");
    }
    // Rate limit: max 5 attempts per 15 minutes per account.
    await ctx.runMutation(internal.auth._enforceRateLimit, {
      key: `changePassword:${account.email}`,
      windowMs: 15 * 60 * 1000,
      max: 5,
    });
    if (args.newPassword === args.currentPassword) {
      throw new ConvexError("New password must differ from the current password.");
    }
    // Validate new password format BEFORE verifying current — gives a useful
    // client-side hint without leaking whether the current is right.
    validatePasswordOrThrow(args.newPassword);

    // Verify the current password. Library throws `InvalidSecret` on bad
    // password and `InvalidAccountId` on missing account; both must be
    // surfaced to the client as the same generic message so the password
    // route can't be used to probe account existence.
    try {
      await retrieveAccount(ctx, {
        provider: "password",
        account: { id: account.email, secret: args.currentPassword },
      });
    } catch {
      throw new ConvexError(GENERIC_AUTH_ERROR);
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: account.email, secret: args.newPassword },
    });
  },
});

/**
 * Internal mutation: rewrites both the `users.email` and the matching
 * `authAccounts.providerAccountId`. Used by `changeEmail` after the caller's
 * current password has been verified.
 */
export const _setEmailInternal = internalMutation({
  args: { userId: v.id("users"), newEmail: v.string() },
  handler: async (ctx, args) => {
    // Uniqueness check on users.
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.newEmail))
      .unique();
    if (existingUser && existingUser._id !== args.userId) {
      throw new ConvexError("That email is already in use.");
    }

    // Find the password-provider account for this user and rewrite its id.
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", args.userId).eq("provider", "password"),
      )
      .unique();
    if (!account) throw new ConvexError("Account not found");

    const conflict = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", args.newEmail),
      )
      .unique();
    if (conflict && conflict._id !== account._id) {
      throw new ConvexError("That email is already in use.");
    }

    await ctx.db.patch("authAccounts", account._id, {
      providerAccountId: args.newEmail,
    });
    await ctx.db.patch("users", args.userId, { email: args.newEmail });
  },
});

export const changeEmail = action({
  args: { newEmail: v.string(), currentPassword: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const account = await ctx.runQuery(
      internal.auth._getMyAccountIdentifier,
      {},
    );
    if (!account) throw new ConvexError("Not authenticated");

    await ctx.runMutation(internal.auth._enforceRateLimit, {
      key: `changeEmail:${account.email}`,
      windowMs: 15 * 60 * 1000,
      max: 5,
    });

    const trimmed = args.newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      throw new ConvexError("Enter a valid email.");
    }
    if (trimmed === account.email.toLowerCase()) {
      throw new ConvexError("That's already your email.");
    }

    try {
      await retrieveAccount(ctx, {
        provider: "password",
        account: { id: account.email, secret: args.currentPassword },
      });
    } catch {
      throw new ConvexError(GENERIC_AUTH_ERROR);
    }

    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");

    await ctx.runMutation(internal.auth._setEmailInternal, {
      userId,
      newEmail: trimmed,
    });
  },
});
