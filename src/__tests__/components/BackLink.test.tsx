import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", async () => {
  const m = await import("../_helpers/mockRouter");
  return m.routerMock();
});

import { BackLink } from "@/components/BackLink";

describe("<BackLink />", () => {
  it("renders the default 'Back' label and links to the supplied path", () => {
    render(<BackLink to="/expenses" />);
    const link = screen.getByRole("link", { name: /back/i });
    expect(link).toHaveAttribute("href", "/expenses");
  });

  it("respects a custom label", () => {
    render(<BackLink to="/" label="Home" />);
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
  });
});
