import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatePicker } from "@/components/DatePicker";

describe("<DatePicker />", () => {
  it("shows the placeholder when no value is set", () => {
    render(<DatePicker value={undefined} onChange={() => {}} />);
    expect(screen.getByRole("button")).toHaveTextContent(/pick a date/i);
  });

  it("renders a formatted date for a yyyy-MM-dd value", () => {
    render(<DatePicker value="2026-04-29" onChange={() => {}} />);
    // Don't pin to an exact format string — just confirm it's not the placeholder.
    expect(screen.getAllByRole("button")[0]).not.toHaveTextContent(
      /pick a date/i,
    );
  });

  it("renders a clear button when a value is set and clicking it calls onChange(undefined)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DatePicker value="2026-04-29" onChange={onChange} />);
    const clear = screen.getByRole("button", { name: /clear date/i });
    await user.click(clear);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("does not render the clear button when no value is set", () => {
    render(<DatePicker value={undefined} onChange={() => {}} />);
    expect(
      screen.queryByRole("button", { name: /clear date/i }),
    ).not.toBeInTheDocument();
  });

  it("treats invalid ISO strings as no selection (placeholder shown)", () => {
    render(<DatePicker value="not-a-date" onChange={() => {}} />);
    expect(screen.getByRole("button")).toHaveTextContent(/pick a date/i);
  });
});
