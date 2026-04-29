import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordInput } from "@/components/PasswordInput";

describe("<PasswordInput />", () => {
  it("starts hidden (type=password)", () => {
    render(<PasswordInput aria-label="password" defaultValue="hunter2" />);
    expect(screen.getByLabelText("password")).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("toggles between password and text via the eye button", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="password" defaultValue="hunter2" />);
    const input = screen.getByLabelText("password");
    const toggle = screen.getByRole("button", { name: /show password/i });
    await user.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: /hide password/i }));
    expect(input).toHaveAttribute("type", "password");
  });
});
