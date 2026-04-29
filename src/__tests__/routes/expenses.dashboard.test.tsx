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

import { Route } from "@/routes/expenses/index";
import { api } from "../../../convex/_generated/api";
import {
  resetConvexMocks,
  setQueryResult,
} from "../_helpers/mockConvex";
import { resetRouterMock } from "../_helpers/mockRouter";
import { fakeMe, fakeExpense } from "../_helpers/fixtures";

beforeEach(() => {
  resetConvexMocks();
  resetRouterMock();
});

const Component = (Route as unknown as { options: { component: () => React.ReactNode } }).options
  .component;

describe("/expenses (Manager Dashboard)", () => {
  it("renders the dashboard for an approver", () => {
    setQueryResult(api.auth.getMe, fakeMe({ permissions: ["expenses.approve"] }));
    setQueryResult(api.approvals.listMyDashboard, {
      page: [],
      isDone: true,
      continueCursor: "",
    });
    render(<Component />);
    expect(
      screen.getByRole("heading", { name: /expenses/i }),
    ).toBeInTheDocument();
  });

  it("renders rows from the dashboard query", () => {
    setQueryResult(api.auth.getMe, fakeMe({ permissions: ["expenses.approve"] }));
    const expense = fakeExpense({
      status: "pending",
      description: "Conference ticket",
    });
    setQueryResult(api.approvals.listMyDashboard, {
      page: [
        {
          expense,
          submitter: {
            _id: expense.submitterId,
            name: "Carol",
            email: "carol@example.com",
          },
        },
      ],
      isDone: true,
      continueCursor: "",
    });
    render(<Component />);
    expect(screen.getByText("Carol")).toBeInTheDocument();
  });

  it("renders ForbiddenPanel when the user lacks expenses.approve", () => {
    setQueryResult(api.auth.getMe, fakeMe({ permissions: [] }));
    render(<Component />);
    expect(
      screen.getByRole("heading", { name: /access denied/i }),
    ).toBeInTheDocument();
  });
});
