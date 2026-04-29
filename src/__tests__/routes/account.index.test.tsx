import type * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("convex/react", async () => {
  const m = await import("../_helpers/mockConvex");
  return m.convexMock();
});

vi.mock("@tanstack/react-router", async () => {
  const m = await import("../_helpers/mockRouter");
  return m.routerMock();
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { Route } from "@/routes/account/index";
import { api } from "../../../convex/_generated/api";
import {
  resetConvexMocks,
  setQueryResult,
} from "../_helpers/mockConvex";
import { resetRouterMock } from "../_helpers/mockRouter";
import { fakeMe } from "../_helpers/fixtures";

beforeEach(() => {
  resetConvexMocks();
  resetRouterMock();
});

const Component = (Route as unknown as { options: { component: () => React.ReactNode } }).options
  .component;

describe("/account (Account Settings)", () => {
  it("renders both the Email and Password cards when authenticated", () => {
    setQueryResult(api.auth.getMe, fakeMe());
    render(<Component />);
    expect(
      screen.getByRole("heading", { name: /account settings/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText(/password/i).length).toBeGreaterThan(0);
  });

  it("redirects unauthenticated callers to /auth/login", () => {
    setQueryResult(api.auth.getMe, null);
    render(<Component />);
    expect(screen.getByTestId("navigate-stub")).toHaveAttribute(
      "data-to",
      "/auth/login",
    );
  });
});
