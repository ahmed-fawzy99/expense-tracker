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
import { useMyPermissions } from "@/hooks/useMyPermissions";
import { fakeMe } from "../_helpers/fixtures";

beforeEach(() => {
  resetConvexMocks();
});

describe("useMyPermissions", () => {
  it("reports ready=false while loading and denies every permission", () => {
    const { result } = renderHook(() => useMyPermissions());
    expect(result.current.ready).toBe(false);
    expect(result.current.has("expenses.create")).toBe(false);
  });

  it("reports ready=true and denies all when unauthenticated", () => {
    setQueryResult(api.auth.getMe, null);
    const { result } = renderHook(() => useMyPermissions());
    expect(result.current.ready).toBe(true);
    expect(result.current.has("expenses.create")).toBe(false);
  });

  it("grants the permissions in the Me payload and denies others", () => {
    setQueryResult(
      api.auth.getMe,
      fakeMe({ permissions: ["expenses.create", "expenses.read.own"] }),
    );
    const { result } = renderHook(() => useMyPermissions());
    expect(result.current.has("expenses.create")).toBe(true);
    expect(result.current.has("expenses.read.own")).toBe(true);
    expect(result.current.has("expenses.approve")).toBe(false);
  });
});
