import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CurrencySelect } from "@/components/CurrencySelect";

describe("<CurrencySelect />", () => {
  it("shows the selected code on the trigger", () => {
    render(<CurrencySelect value="USD" onChange={() => {}} />);
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("USD");
  });

  it("falls back to the placeholder when no value is selected", () => {
    render(
      <CurrencySelect value="" onChange={() => {}} placeholder="Pick one" />,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Pick one");
  });

  it("opens a search input when activated", async () => {
    const user = userEvent.setup();
    render(<CurrencySelect value="USD" onChange={() => {}} />);
    await user.click(screen.getByRole("combobox"));
    expect(
      await screen.findByPlaceholderText(/search 3-letter code/i),
    ).toBeInTheDocument();
  });

  it("disables the trigger when disabled is set", () => {
    render(<CurrencySelect value="USD" onChange={() => {}} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("shows 'No matches.' when the query matches nothing", async () => {
    const user = userEvent.setup();
    render(<CurrencySelect value="USD" onChange={vi.fn()} />);
    await user.click(screen.getByRole("combobox"));
    const search = await screen.findByPlaceholderText(/search 3-letter code/i);
    await user.type(search, "zzzzz");
    expect(await screen.findByText(/no matches\./i)).toBeInTheDocument();
  });
});
