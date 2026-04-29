import { z } from "zod";

/**
 * Shared URL-search shape for any server-paginated table.
 *
 * - `page` is 1-based display index.
 * - `pageSize` is bounded so a hostile URL can't ask for 1M rows.
 * - `cursors[i]` is the Convex `continueCursor` used to fetch page `i + 2`.
 *   (Page 1 needs no cursor, hence the off-by-one.) Storing the stack in
 *   the URL means a hard refresh on page 3 still lands on page 3 instead
 *   of resetting to page 1.
 * - Per-route filters live in the route's own search schema and are
 *   merged with this base.
 */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export const tableSearchSchema = z.object({
  page: z.number().int().min(1).catch(1).default(1),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(100)
    .catch(DEFAULT_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  sortBy: z.string().optional().catch(undefined),
  sortDir: z.enum(["asc", "desc"]).optional().catch(undefined),
  cursors: z.array(z.string()).catch([]).default([]),
});

export type TableSearch = z.infer<typeof tableSearchSchema>;

/**
 * Returns the cursor to use when fetching the current page, or null for
 * page 1. Reads `cursors[page - 2]` defensively — a tampered URL with a
 * mismatched stack length falls back to null (= page 1).
 */
export function cursorForPage(
  cursors: string[],
  page: number,
): string | null {
  if (page <= 1) return null;
  return cursors[page - 2] ?? null;
}
