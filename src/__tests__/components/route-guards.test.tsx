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

import { api } from "../../../convex/_generated/api";
import { resetConvexMocks, setQueryResult } from "../_helpers/mockConvex";
import { lastNavigateCall, resetRouterMock } from "../_helpers/mockRouter";
import { fakeMe } from "../_helpers/fixtures";
import { RequireAuth, RequirePermission } from "@/lib/route-guards";

beforeEach(() => {
  resetConvexMocks();
  resetRouterMock();
});

describe("<RequireAuth />", () => {
  it("renders children when authenticated", () => {
    setQueryResult(api.auth.getMe, fakeMe());
    render(
      <RequireAuth>
        <div>private content</div>
      </RequireAuth>,
    );
    expect(screen.getByText("private content")).toBeInTheDocument();
  });

  it("renders a loading skeleton while the query is in flight", () => {
    const { container } = render(
      <RequireAuth>
        <div>private content</div>
      </RequireAuth>,
    );
    expect(screen.queryByText("private content")).not.toBeInTheDocument();
    expect(container.firstChild).toBeTruthy();
  });

  it("issues a Navigate to /auth/login when unauthenticated", () => {
    setQueryResult(api.auth.getMe, null);
    render(
      <RequireAuth>
        <div>private content</div>
      </RequireAuth>,
    );
    expect(screen.queryByText("private content")).not.toBeInTheDocument();
    expect(screen.getByTestId("navigate-stub")).toHaveAttribute(
      "data-to",
      "/auth/login",
    );
    const last = lastNavigateCall();
    expect(typeof last === "object" && last !== null && last.to).toBe(
      "/auth/login",
    );
  });
});

describe("<RequirePermission />", () => {
  it("renders children when the user has the permission", () => {
    setQueryResult(
      api.auth.getMe,
      fakeMe({ permissions: ["expenses.approve"] }),
    );
    render(
      <RequirePermission permission="expenses.approve">
        <div>manager dashboard</div>
      </RequirePermission>,
    );
    expect(screen.getByText("manager dashboard")).toBeInTheDocument();
  });

  it("renders <ForbiddenPanel> in place when permission is missing (NEVER redirects)", () => {
    setQueryResult(api.auth.getMe, fakeMe({ permissions: [] }));
    render(
      <RequirePermission permission="expenses.approve">
        <div>manager dashboard</div>
      </RequirePermission>,
    );
    expect(screen.queryByText("manager dashboard")).not.toBeInTheDocument();
    expect(screen.queryByTestId("navigate-stub")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /access denied/i }),
    ).toBeInTheDocument();
  });

  it("uses a custom message when one is supplied", () => {
    setQueryResult(api.auth.getMe, fakeMe({ permissions: [] }));
    render(
      <RequirePermission
        permission="expenses.approve"
        message="Manager role required."
      >
        <div>manager dashboard</div>
      </RequirePermission>,
    );
    expect(screen.getByText("Manager role required.")).toBeInTheDocument();
  });

  it("redirects to login if the user is unauthenticated even with permission required", () => {
    setQueryResult(api.auth.getMe, null);
    render(
      <RequirePermission permission="expenses.approve">
        <div>manager dashboard</div>
      </RequirePermission>,
    );
    expect(screen.getByTestId("navigate-stub")).toHaveAttribute(
      "data-to",
      "/auth/login",
    );
  });
});
