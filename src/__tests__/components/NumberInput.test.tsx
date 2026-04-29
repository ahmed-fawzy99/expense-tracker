import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberInput } from "@/components/NumberInput";

function Controlled({ decimals = 2 }: { decimals?: number }) {
  const [value, setValue] = useState("");
  return (
    <NumberInput
      value={value}
      onChange={setValue}
      decimals={decimals}
      aria-label="amount"
    />
  );
}

describe("<NumberInput />", () => {
  it("strips non-digit, non-dot characters", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByLabelText<HTMLInputElement>("amount");
    await user.type(input, "12abc.34xyz");
    expect(input.value).toBe("12.34");
  });

  it("keeps only the first decimal point", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByLabelText<HTMLInputElement>("amount");
    await user.type(input, "1.2.3");
    expect(input.value.split(".").length).toBeLessThanOrEqual(2);
  });

  it("blocks the 'e' key from being typed", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByLabelText<HTMLInputElement>("amount");
    await user.type(input, "1e5");
    expect(input.value).not.toMatch(/e/i);
  });

  it("caps decimals at the configured precision", async () => {
    const user = userEvent.setup();
    render(<Controlled decimals={2} />);
    const input = screen.getByLabelText<HTMLInputElement>("amount");
    await user.type(input, "1.23456");
    const decimals = (input.value.split(".")[1] ?? "").length;
    expect(decimals).toBeLessThanOrEqual(2);
  });
});
