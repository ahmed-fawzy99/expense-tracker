import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("convex/react", async () => {
  const m = await import("../_helpers/mockConvex");
  return m.convexMock();
});

import { api } from "../../../convex/_generated/api";
import {
  resetConvexMocks,
  setQueryResult,
} from "../_helpers/mockConvex";
import { ActivityLog } from "@/components/ActivityLog";
import type { Id } from "../../../convex/_generated/dataModel";

const expenseId = "expenses_1" as Id<"expenses">;

beforeEach(() => {
  resetConvexMocks();
});

describe("<ActivityLog />", () => {
  it("renders a loading skeleton while the query is in flight", () => {
    const { container } = render(
      <ActivityLog expenseId={expenseId} view="owner" />,
    );
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it("renders an empty-state message when the activity log is empty", () => {
    setQueryResult(api.activity.listForOwner, []);
    render(<ActivityLog expenseId={expenseId} view="owner" />);
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });

  it("renders a labeled entry per event for the owner view", () => {
    setQueryResult(api.activity.listForOwner, [
      {
        _id: "a1",
        _creationTime: 1_700_000_000_000,
        event: "submitted",
        description: "Sent to alice@example.com",
      },
      {
        _id: "a2",
        _creationTime: 1_700_000_100_000,
        event: "approved",
        description: "Approved by alice@example.com",
      },
    ]);
    render(<ActivityLog expenseId={expenseId} view="owner" />);
    expect(screen.getByText(/submitted for approval/i)).toBeInTheDocument();
    expect(screen.getByText(/^approved$/i)).toBeInTheDocument();
    expect(screen.getByText(/sent to alice/i)).toBeInTheDocument();
  });

  it("uses the full-history query when view='full'", () => {
    setQueryResult(api.activity.listForSubject, [
      {
        _id: "a1",
        _creationTime: 1_700_000_000_000,
        event: "chain_extended",
        description: "Handed off to manager",
      },
    ]);
    render(<ActivityLog expenseId={expenseId} view="full" />);
    expect(
      screen.getByText(/handed off to next approver/i),
    ).toBeInTheDocument();
  });
});
