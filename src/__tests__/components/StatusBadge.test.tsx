import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/StatusBadge";
import { EXPENSE_STATUSES, STATUS_LABEL } from "@/lib/status";

describe("<StatusBadge />", () => {
  it.each(EXPENSE_STATUSES)("renders the human label for %s", (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(STATUS_LABEL[status])).toBeInTheDocument();
  });

  it("forwards a custom className", () => {
    const { container } = render(
      <StatusBadge status="pending" className="my-test-class" />,
    );
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toMatch(/my-test-class/);
  });
});
