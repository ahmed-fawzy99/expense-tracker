import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("convex/react", async () => {
  const helpers = await import("../_helpers/mockConvex");
  return helpers.convexMock();
});

import { api } from "../../../convex/_generated/api";
import {
  resetConvexMocks,
  setQueryResult,
} from "../_helpers/mockConvex";
import { useMe } from "@/hooks/useMe";
import { fakeMe } from "../_helpers/fixtures";

beforeEach(() => {
  resetConvexMocks();
});

describe("useMe", () => {
  it("returns undefined while the query is loading", () => {
    const { result } = renderHook(() => useMe());
    expect(result.current).toBeUndefined();
  });

  it("returns null for an unauthenticated caller", () => {
    setQueryResult(api.auth.getMe, null);
    const { result } = renderHook(() => useMe());
    expect(result.current).toBeNull();
  });

  it("returns the authenticated caller's profile", () => {
    const me = fakeMe({ permissions: ["expenses.read"] });
    setQueryResult(api.auth.getMe, me);
    const { result } = renderHook(() => useMe());
    expect(result.current).toEqual(me);
  });
});
