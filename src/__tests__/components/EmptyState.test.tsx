import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

describe("<EmptyState />", () => {
  it("renders the title only when description is omitted", () => {
    render(<EmptyState title="No items" />);
    expect(screen.getByText("No items")).toBeInTheDocument();
  });

  it("renders icon, description and action when supplied", () => {
    render(
      <EmptyState
        icon={Inbox}
        title="Nothing here"
        description="Add an expense to get started."
        action={<button>New</button>}
      />,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(
      screen.getByText("Add an expense to get started."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });
});
