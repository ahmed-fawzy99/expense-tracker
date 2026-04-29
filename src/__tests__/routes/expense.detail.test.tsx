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

import { Route } from "@/routes/expense/$expenseId";
import { api } from "../../../convex/_generated/api";
import {
  resetConvexMocks,
  setQueryResult,
} from "../_helpers/mockConvex";
import { resetRouterMock } from "../_helpers/mockRouter";
import { fakeMe, fakeExpense, TEST_USER_ID } from "../_helpers/fixtures";
import type { Id } from "../../../convex/_generated/dataModel";

beforeEach(() => {
  resetConvexMocks();
  resetRouterMock();
});

const Component = (Route as unknown as { options: { component: () => React.ReactNode } }).options
  .component;

describe("/expense/$expenseId", () => {
  it("renders 'Edit draft' for an owner viewing their draft", () => {
    setQueryResult(
      api.auth.getMe,
      fakeMe({
        permissions: ["expenses.create"],
        managerId: "users_2" as Id<"users">,
      }),
    );
    setQueryResult(
      api.expenses.get,
      fakeExpense({ status: "draft", submitterId: TEST_USER_ID }),
    );
    setQueryResult(api.activity.listForOwner, []);
    render(<Component />);
    expect(
      screen.getByRole("heading", { name: /edit draft/i }),
    ).toBeInTheDocument();
    // Form's submit button is present.
    expect(
      screen.getByRole("button", { name: /save draft/i }),
    ).toBeInTheDocument();
  });

  it("renders 'Edit & resubmit' for an owner viewing a rejected expense", () => {
    setQueryResult(
      api.auth.getMe,
      fakeMe({
        permissions: ["expenses.create"],
        managerId: "users_2" as Id<"users">,
      }),
    );
    setQueryResult(
      api.expenses.get,
      fakeExpense({ status: "rejected", submitterId: TEST_USER_ID }),
    );
    setQueryResult(api.activity.listForOwner, []);
    render(<Component />);
    expect(
      screen.getByRole("heading", { name: /edit & resubmit/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save & resubmit/i }),
    ).toBeInTheDocument();
  });

  it("renders read-only detail for a non-owner approver viewing a pending expense", () => {
    setQueryResult(
      api.auth.getMe,
      fakeMe({
        permissions: ["expenses.approve", "expenses.read"],
      }),
    );
    setQueryResult(
      api.expenses.get,
      fakeExpense({
        status: "pending",
        submitterId: "users_2" as Id<"users">,
        description: "Office supplies",
      }),
    );
    setQueryResult(api.users.get, {
      _id: "users_2",
      name: "Bob",
      email: "bob@example.com",
    });
    setQueryResult(api.activity.listForSubject, []);
    render(<Component />);
    expect(
      screen.getByRole("heading", { name: /expense detail/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Office supplies")).toBeInTheDocument();
    expect(screen.getByText(/submitted by bob/i)).toBeInTheDocument();
  });

  it("renders ForbiddenPanel when the expense query returns null", () => {
    setQueryResult(api.auth.getMe, fakeMe());
    setQueryResult(api.expenses.get, null);
    render(<Component />);
    expect(
      screen.getByRole("heading", { name: /access denied/i }),
    ).toBeInTheDocument();
  });

  it("renders a loading skeleton while the expense query is in flight", () => {
    setQueryResult(api.auth.getMe, fakeMe());
    // expense query intentionally not set → undefined
    const { container } = render(<Component />);
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0);
  });
});
