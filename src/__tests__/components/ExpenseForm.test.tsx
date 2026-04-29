import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

import { api } from "../../../convex/_generated/api";
import {
  getMutationCalls,
  resetConvexMocks,
  setMutationImpl,
} from "../_helpers/mockConvex";
import { resetRouterMock } from "../_helpers/mockRouter";
import { ExpenseForm } from "@/components/ExpenseForm";
import { fakeExpense } from "../_helpers/fixtures";

beforeEach(() => {
  resetConvexMocks();
  resetRouterMock();
});

describe("<ExpenseForm /> (create mode)", () => {
  it("renders the create-mode action buttons", () => {
    render(<ExpenseForm />);
    expect(
      screen.getByRole("button", { name: /save draft/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /submit for approval/i }),
    ).toBeInTheDocument();
  });

  it("blocks Submit when no receipt is attached and surfaces an inline error", async () => {
    const user = userEvent.setup();
    setMutationImpl(api.expenses.createAndSubmit, async () => "exp_new");
    render(<ExpenseForm />);

    await user.type(screen.getByLabelText(/amount/i), "12.34");
    await user.type(screen.getByLabelText(/description/i), "Lunch");

    await user.click(screen.getByRole("button", { name: /submit for approval/i }));

    // Mutation should NOT have been called because no receipt is attached.
    expect(getMutationCalls(api.expenses.createAndSubmit)).toHaveLength(0);
    expect(
      await screen.findByText(/attach a receipt before submitting/i),
    ).toBeInTheDocument();
  });

  it("flags invalid input via aria-invalid when the user submits an empty form", async () => {
    const user = userEvent.setup();
    render(<ExpenseForm />);

    await user.click(screen.getByRole("button", { name: /save draft/i }));

    // react-hook-form sets aria-invalid="true" on fields with errors. We poll
    // because validation runs asynchronously.
    await waitFor(() => {
      const invalid = document.querySelectorAll('[aria-invalid="true"]');
      expect(invalid.length).toBeGreaterThan(0);
    });
  });
});

describe("<ExpenseForm /> (edit / draft mode)", () => {
  it("pre-fills the form from the supplied expense doc", () => {
    const expense = fakeExpense({
      description: "Hotel",
      amount: 50000,
      currency: "EUR",
      category: "lodging",
    });
    render(<ExpenseForm initial={expense} />);
    expect(screen.getByLabelText(/description/i)).toHaveValue("Hotel");
    expect(screen.getByLabelText(/amount/i)).toHaveValue("500.00");
  });
});

describe("<ExpenseForm /> (resubmit mode)", () => {
  it("renders only the Save & resubmit button", () => {
    const expense = fakeExpense({ status: "rejected" });
    render(<ExpenseForm initial={expense} mode="resubmit" />);
    expect(
      screen.getByRole("button", { name: /save & resubmit/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save draft/i }),
    ).not.toBeInTheDocument();
  });
});
