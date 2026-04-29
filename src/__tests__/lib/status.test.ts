import { describe, expect, it } from "vitest";
import {
  EXPENSE_STATUSES,
  STATUS_LABEL,
  STATUS_VARIANT,
} from "@/lib/status";

describe("status maps", () => {
  it("exposes a stable list of statuses in display order", () => {
    expect(EXPENSE_STATUSES).toEqual([
      "draft",
      "pending",
      "approved",
      "rejected",
    ]);
  });

  it("has a label for every status", () => {
    for (const s of EXPENSE_STATUSES) {
      expect(typeof STATUS_LABEL[s]).toBe("string");
      expect(STATUS_LABEL[s].length).toBeGreaterThan(0);
    }
  });

  it("maps every status to a known badge variant", () => {
    const allowed = new Set(["secondary", "default", "destructive", "outline"]);
    for (const s of EXPENSE_STATUSES) {
      expect(allowed.has(STATUS_VARIANT[s])).toBe(true);
    }
  });

  it("uses destructive variant for rejected and default for approved", () => {
    expect(STATUS_VARIANT.rejected).toBe("destructive");
    expect(STATUS_VARIANT.approved).toBe("default");
  });
});
