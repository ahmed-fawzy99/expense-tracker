import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("convex/react", async () => {
  const m = await import("../_helpers/mockConvex");
  return m.convexMock();
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { api } from "../../../convex/_generated/api";
import {
  getMutationCalls,
  resetConvexMocks,
  setMutationImpl,
} from "../_helpers/mockConvex";
import { ApprovalDialog } from "@/components/ApprovalDialog";
import type { Id } from "../../../convex/_generated/dataModel";

const expenseId = "expenses_1" as Id<"expenses">;

beforeEach(() => {
  resetConvexMocks();
});

describe("<ApprovalDialog />", () => {
  it("opens when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ApprovalDialog
        expenseId={expenseId}
        mode="approve"
        trigger={<button>Approve</button>}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(
      await screen.findByRole("heading", { name: /approve expense/i }),
    ).toBeInTheDocument();
  });

  it("calls the approve mutation when the user confirms", async () => {
    setMutationImpl(api.approvals.approve, async () => undefined);
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(
      <ApprovalDialog
        expenseId={expenseId}
        mode="approve"
        trigger={<button>Approve</button>}
        onDone={onDone}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Approve" }));
    // Footer's "Approve" button is the second match — click via the dialog.
    const dialog = await screen.findByRole("dialog");
    const buttons = dialog.querySelectorAll("button");
    const confirm = Array.from(buttons).find(
      (b) => b.textContent?.trim() === "Approve",
    );
    expect(confirm).toBeTruthy();
    await user.click(confirm!);

    const calls = getMutationCalls(api.approvals.approve);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toMatchObject({ expenseId });
    expect(onDone).toHaveBeenCalled();
  });

  it("blocks reject submission with an empty note and shows an inline error", async () => {
    const user = userEvent.setup();
    render(
      <ApprovalDialog
        expenseId={expenseId}
        mode="reject"
        trigger={<button>Reject</button>}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog");
    const buttons = dialog.querySelectorAll("button");
    const confirm = Array.from(buttons).find(
      (b) => b.textContent?.trim() === "Reject",
    );
    await user.click(confirm!);

    expect(getMutationCalls(api.approvals.reject)).toHaveLength(0);
    expect(await screen.findByRole("alert")).toHaveTextContent(/reason/i);
  });

  it("calls the reject mutation when a note is provided", async () => {
    setMutationImpl(api.approvals.reject, async () => undefined);
    const user = userEvent.setup();
    render(
      <ApprovalDialog
        expenseId={expenseId}
        mode="reject"
        trigger={<button>Reject</button>}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const note = await screen.findByLabelText("Reason");
    await user.type(note, "Receipt is unreadable");
    const dialog = screen.getByRole("dialog");
    const confirm = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Reject",
    );
    await user.click(confirm!);

    const calls = getMutationCalls(api.approvals.reject);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toMatchObject({
      expenseId,
      note: "Receipt is unreadable",
    });
  });
});
