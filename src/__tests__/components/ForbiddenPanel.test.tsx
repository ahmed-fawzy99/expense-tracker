import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ForbiddenPanel } from "@/components/ForbiddenPanel";

describe("<ForbiddenPanel />", () => {
  it("renders the standard 'Access denied' headline and default copy", () => {
    render(<ForbiddenPanel />);
    expect(
      screen.getByRole("heading", { name: /access denied/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/don't have permission/i),
    ).toBeInTheDocument();
  });

  it("renders a custom message when supplied", () => {
    render(<ForbiddenPanel message="Manager role required." />);
    expect(screen.getByText("Manager role required.")).toBeInTheDocument();
  });
});
