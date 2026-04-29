import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("ignores falsy values", () => {
    expect(cn("a", null, undefined, false, "b")).toBe("a b");
  });

  it("dedupes conflicting tailwind classes via tailwind-merge", () => {
    // The latter px-4 wins.
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles array inputs (clsx pass-through)", () => {
    expect(cn(["a", ["b", "c"]])).toBe("a b c");
  });
});
