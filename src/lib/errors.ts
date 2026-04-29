import { ConvexError } from "convex/values";

/**
 * Extracts a user-facing message from a thrown value.
 *
 * Defense-in-depth: only `ConvexError` payloads (`.data`) are intentional,
 * client-safe messages. Anything else is treated as an unexpected server
 * fault and surfaced as the caller-supplied generic fallback — we never
 * leak `.message` from a plain `Error`, because in development that string
 * carries the Convex wrapper (`[CONVEX A(foo:bar)] [Request ID: ...] Server
 * Error Uncaught Error: ...`) plus the original message, and in production
 * Convex already scrubs it to `"Server Error"`. Showing either to the
 * end-user is wrong: the dev string leaks server detail, the prod string
 * is meaningless.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) {
    const data = (error as ConvexError<string>).data;
    if (typeof data === "string") return data;
  }
  return fallback;
}
