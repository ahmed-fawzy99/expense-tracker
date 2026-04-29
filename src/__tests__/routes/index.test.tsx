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

import { Route } from "@/routes/index";
import { api } from "../../../convex/_generated/api";
import {
  resetConvexMocks,
  setQueryResult,
} from "../_helpers/mockConvex";
import { resetRouterMock } from "../_helpers/mockRouter";
import { fakeMe, fakeExpense } from "../_helpers/fixtures";
import type { Id } from "../../../convex/_generated/dataModel";

beforeEach(() => {
  resetConvexMocks();
  resetRouterMock();
});

const Component = (Route as unknown as { options: { component: () => React.ReactNode } }).options
  .component;

describe("/ (My Expenses)", () => {
  it("renders without crashing in the loading state", () => {
    const { container } = render(<Component />);
    expect(container.firstChild).toBeTruthy();
  });

  it("renders the My Expenses heading once authenticated with a manager", () => {
    setQueryResult(
      api.auth.getMe,
      fakeMe({
        permissions: ["expenses.create", "expenses.read"],
        managerId: "users_2" as Id<"users">,
      }),
    );
    setQueryResult(api.expenses.listMine, {
      page: [],
      isDone: true,
      continueCursor: "",
    });
    render(<Component />);
    expect(
      screen.getByRole("heading", { name: /my expenses/i }),
    ).toBeInTheDocument();
  });

  it("renders the empty hero with a CTA when there are no expenses", () => {
    setQueryResult(
      api.auth.getMe,
      fakeMe({
        permissions: ["expenses.create"],
        managerId: "users_2" as Id<"users">,
      }),
    );
    setQueryResult(api.expenses.listMine, {
      page: [],
      isDone: true,
      continueCursor: "",
    });
    render(<Component />);
    expect(screen.getByText(/no expenses yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /create your first one/i }),
    ).toBeInTheDocument();
  });

  it("renders rows from the listMine query", () => {
    setQueryResult(
      api.auth.getMe,
      fakeMe({
        permissions: ["expenses.read"],
        managerId: "users_2" as Id<"users">,
      }),
    );
    setQueryResult(api.expenses.listMine, {
      page: [
        fakeExpense({ description: "Hotel stay", amount: 9999, status: "approved" }),
      ],
      isDone: true,
      continueCursor: "",
    });
    render(<Component />);
    expect(screen.getByText("Hotel stay")).toBeInTheDocument();
    expect(screen.getByText(/approved/i)).toBeInTheDocument();
  });

  it("redirects unmanaged approvers to /expenses (manager dashboard)", () => {
    setQueryResult(
      api.auth.getMe,
      fakeMe({
        permissions: ["expenses.approve"],
        managerId: null,
      }),
    );
    render(<Component />);
    const stub = screen.getByTestId("navigate-stub");
    expect(stub).toHaveAttribute("data-to", "/expenses");
  });

  it("renders ForbiddenPanel when the user is unauthenticated", () => {
    setQueryResult(api.auth.getMe, null);
    render(<Component />);
    // RequireAuth Navigates to /auth/login for unauthed.
    expect(screen.getByTestId("navigate-stub")).toHaveAttribute(
      "data-to",
      "/auth/login",
    );
  });
});
