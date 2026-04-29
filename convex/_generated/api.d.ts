/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as approvals from "../approvals.js";
import type * as auth from "../auth.js";
import type * as categoryList from "../categoryList.js";
import type * as crons from "../crons.js";
import type * as expenses from "../expenses.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_authConstants from "../lib/authConstants.js";
import type * as lib_chain from "../lib/chain.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as notifications from "../notifications.js";
import type * as roles from "../roles.js";
import type * as seed from "../seed.js";
import type * as teams from "../teams.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  approvals: typeof approvals;
  auth: typeof auth;
  categoryList: typeof categoryList;
  crons: typeof crons;
  expenses: typeof expenses;
  files: typeof files;
  http: typeof http;
  "lib/activity": typeof lib_activity;
  "lib/authConstants": typeof lib_authConstants;
  "lib/chain": typeof lib_chain;
  "lib/permissions": typeof lib_permissions;
  "lib/rateLimit": typeof lib_rateLimit;
  notifications: typeof notifications;
  roles: typeof roles;
  seed: typeof seed;
  teams: typeof teams;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
