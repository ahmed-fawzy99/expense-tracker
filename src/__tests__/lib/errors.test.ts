import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { getErrorMessage } from "@/lib/errors";

describe("getErrorMessage", () => {
  it("returns the ConvexError data when it is a string", () => {
    const err = new ConvexError("Forbidden: not your team");
    expect(getErrorMessage(err, "default")).toBe("Forbidden: not your team");
  });

  it("returns the fallback for a plain Error (avoids leaking server detail)", () => {
    const err = new Error("[CONVEX A(...)] Server Error: leaky internals");
    expect(getErrorMessage(err, "Could not save")).toBe("Could not save");
  });

  it("returns the fallback for a ConvexError carrying non-string data", () => {
    const err = new ConvexError({ code: 400 });
    expect(getErrorMessage(err, "fallback")).toBe("fallback");
  });

  it("returns the fallback for non-Error throws", () => {
    expect(getErrorMessage("string thrown", "f")).toBe("f");
    expect(getErrorMessage(42, "f")).toBe("f");
    expect(getErrorMessage(null, "f")).toBe("f");
  });
});
