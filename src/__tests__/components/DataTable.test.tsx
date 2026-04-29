import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tanstack/react-router", async () => {
  const m = await import("../_helpers/mockRouter");
  return m.routerMock();
});

import { DataTable } from "@/components/DataTable";
import type { ColumnDef } from "@tanstack/react-table";

interface Row {
  id: string;
  name: string;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Name", cell: (c) => c.getValue<string>() },
];

const baseState = {
  page: 1,
  pageSize: 25,
  cursors: [] as string[],
};

describe("<DataTable />", () => {
  it("renders the hero empty state on page 1 with no rows", () => {
    render(
      <DataTable<Row>
        columns={columns}
        data={{ page: [], isDone: true, continueCursor: "" }}
        state={baseState}
        onStateChange={() => {}}
        emptyState={<div>No expenses yet.</div>}
      />,
    );
    expect(screen.getByText("No expenses yet.")).toBeInTheDocument();
    // Hero replaces the table, so no rows-per-page chrome.
    expect(screen.queryByText(/rows per page/i)).not.toBeInTheDocument();
  });

  it("renders the table chrome and rows when data is present", () => {
    render(
      <DataTable<Row>
        columns={columns}
        data={{
          page: [
            { id: "1", name: "Alpha" },
            { id: "2", name: "Beta" },
          ],
          isDone: true,
          continueCursor: "",
        }}
        state={baseState}
        onStateChange={() => {}}
        emptyState={<div>empty</div>}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText(/rows per page/i)).toBeInTheDocument();
  });

  it("disables Previous on page 1 and enables Next when more pages remain", () => {
    render(
      <DataTable<Row>
        columns={columns}
        data={{
          page: [{ id: "1", name: "Alpha" }],
          isDone: false,
          continueCursor: "abc",
        }}
        state={baseState}
        onStateChange={() => {}}
        emptyState={<div>empty</div>}
      />,
    );
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next page/i })).not.toBeDisabled();
  });

  it("calls onStateChange with the next cursor when Next is clicked", async () => {
    const onStateChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DataTable<Row>
        columns={columns}
        data={{
          page: [{ id: "1", name: "Alpha" }],
          isDone: false,
          continueCursor: "next-cursor",
        }}
        state={baseState}
        onStateChange={onStateChange}
        emptyState={<div>empty</div>}
      />,
    );
    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(onStateChange).toHaveBeenCalledWith({
      page: 2,
      cursors: ["next-cursor"],
    });
  });

  it("renders the per-row link as an <a> when rowLink is supplied", () => {
    render(
      <DataTable<Row>
        columns={columns}
        data={{
          page: [{ id: "1", name: "Alpha" }],
          isDone: true,
          continueCursor: "",
        }}
        state={baseState}
        onStateChange={() => {}}
        rowLink={(_r) => ({ to: "/" })}
        emptyState={<div>empty</div>}
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/");
  });

  it("shows skeleton rows while data is undefined", () => {
    const { container } = render(
      <DataTable<Row>
        columns={columns}
        data={undefined}
        state={baseState}
        onStateChange={() => {}}
        emptyState={<div>empty</div>}
      />,
    );
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0);
  });
});
