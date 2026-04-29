import type * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("convex/react", async () => {
  const m = await import("../_helpers/mockConvex");
  return m.convexMock();
});

vi.mock("@tanstack/react-router", async () => {
  const m = await import("../_helpers/mockRouter");
  return m.routerMock();
});

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: vi.fn(), signOut: vi.fn() }),
}));

import { Route } from "@/routes/__root";

const Component = (
  Route as unknown as { component: () => React.ReactNode; options?: { component: () => React.ReactNode } }
).component;

describe("/__root", () => {
  it("renders without crashing (mocked auth boundaries default to unauthed)", () => {
    const { container } = render(<Component />);
    expect(container).toBeTruthy();
  });
});
