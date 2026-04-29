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

import { Route } from "@/routes/new";
import { api } from "../../../convex/_generated/api";
import {
  resetConvexMocks,
  setQueryResult,
} from "../_helpers/mockConvex";
import { resetRouterMock } from "../_helpers/mockRouter";
import { fakeMe } from "../_helpers/fixtures";
import type { Id } from "../../../convex/_generated/dataModel";

beforeEach(() => {
  resetConvexMocks();
  resetRouterMock();
});

const Component = (Route as unknown as { options: { component: () => React.ReactNode } }).options
  .component;

describe("/new (Create Expense)", () => {
  it("renders the form when the user has expenses.create and a manager", () => {
    setQueryResult(
      api.auth.getMe,
      fakeMe({
        permissions: ["expenses.create"],
        managerId: "users_2" as Id<"users">,
      }),
    );
    render(<Component />);
    expect(
      screen.getByRole("heading", { name: /new expense/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save draft/i }),
    ).toBeInTheDocument();
  });

  it("renders ForbiddenPanel when the user lacks expenses.create", () => {
    setQueryResult(api.auth.getMe, fakeMe({ permissions: [] }));
    render(<Component />);
    expect(
      screen.getByRole("heading", { name: /access denied/i }),
    ).toBeInTheDocument();
  });

  it("renders the 'no manager' inline panel when the user has no assigned manager", () => {
    setQueryResult(
      api.auth.getMe,
      fakeMe({ permissions: ["expenses.create"], managerId: null }),
    );
    render(<Component />);
    expect(
      screen.getByText(/no assigned manager/i),
    ).toBeInTheDocument();
  });
});
