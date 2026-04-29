import { describe, expect, it } from "vitest";
import {
  cursorForPage,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  tableSearchSchema,
} from "@/lib/table-search";

describe("tableSearchSchema", () => {
  it("applies defaults for an empty input", () => {
    const parsed = tableSearchSchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(parsed.cursors).toEqual([]);
  });

  it("clamps a hostile pageSize via the .catch fallback", () => {
    const parsed = tableSearchSchema.parse({ pageSize: 99999 });
    expect(parsed.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("falls back to page 1 when page is invalid", () => {
    const parsed = tableSearchSchema.parse({ page: -3 });
    expect(parsed.page).toBe(1);
  });

  it("accepts valid sortDir values and discards invalid ones", () => {
    expect(tableSearchSchema.parse({ sortDir: "asc" }).sortDir).toBe("asc");
    expect(
      tableSearchSchema.parse({ sortDir: "sideways" }).sortDir,
    ).toBeUndefined();
  });

  it("exposes a fixed list of page-size options", () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([10, 25, 50, 100]);
  });
});

describe("cursorForPage", () => {
  it("returns null for page 1", () => {
    expect(cursorForPage(["a", "b"], 1)).toBeNull();
  });

  it("returns the (page-2)th cursor for later pages", () => {
    expect(cursorForPage(["a", "b", "c"], 2)).toBe("a");
    expect(cursorForPage(["a", "b", "c"], 3)).toBe("b");
  });

  it("returns null when the cursor stack is shorter than expected", () => {
    expect(cursorForPage([], 5)).toBeNull();
  });
});
