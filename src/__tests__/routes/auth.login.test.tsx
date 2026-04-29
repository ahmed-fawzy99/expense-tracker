import type * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("convex/react", async () => {
  const m = await import("../_helpers/mockConvex");
  return m.convexMock();
});

vi.mock("@tanstack/react-router", async () => {
  const m = await import("../_helpers/mockRouter");
  return m.routerMock();
});

const signInMock = vi.fn();
vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: signInMock }),
}));

import { Route } from "@/routes/auth/login";
import { resetConvexMocks, setConvexAuth } from "../_helpers/mockConvex";
import { resetRouterMock, getNavigateMock } from "../_helpers/mockRouter";

beforeEach(() => {
  resetConvexMocks();
  resetRouterMock();
  signInMock.mockReset();
});

const Component = (Route as unknown as { options: { component: () => React.ReactNode } }).options
  .component;

describe("/auth/login", () => {
  it("renders email + password fields and a submit button", () => {
    render(<Component />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("calls signIn with the typed credentials when the form is submitted", async () => {
    signInMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<Component />);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "hunter2");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(signInMock).toHaveBeenCalledWith("password", {
      email: "alice@example.com",
      password: "hunter2",
      flow: "signIn",
    });
  });

  it("shows the generic auth-error message on signIn failure (no provider detail leaked)", async () => {
    signInMock.mockRejectedValue(new Error("InvalidEmailOrPassword"));
    const user = userEvent.setup();
    render(<Component />);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "bad");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      await screen.findByText(/credentials don't look right/i),
    ).toBeInTheDocument();
    // The thrown error message must not appear in the DOM.
    expect(
      screen.queryByText(/InvalidEmailOrPassword/),
    ).not.toBeInTheDocument();
  });

  it("navigates to / when the user is already authenticated", () => {
    setConvexAuth({ isLoading: false, isAuthenticated: true });
    render(<Component />);
    expect(getNavigateMock()).toHaveBeenCalledWith({ to: "/" });
  });
});
