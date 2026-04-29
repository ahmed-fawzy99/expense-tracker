import { DataTable, type TableState } from "@/components/DataTable";
import { DatePicker } from "@/components/DatePicker";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatDate,
  formatMoney,
  formatRelative,
  truncate,
} from "@/lib/format";
import { RequirePermission } from "@/lib/route-guards";
import { cursorForPage, tableSearchSchema } from "@/lib/table-search";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "convex/react";
import { AlertTriangle, Inbox } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { PERMISSIONS } from "../../../convex/lib/authConstants";

const dashboardSearchSchema = tableSearchSchema.extend({
  state: z
    .enum(["all", "pending", "approved", "rejected"])
    .catch("pending")
    .default("pending"),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  sortDir: z.enum(["asc", "desc"]).catch("desc").default("desc"),
});

type DashboardSearch = z.infer<typeof dashboardSearchSchema>;

export const Route = createFileRoute("/expenses/")({
  validateSearch: dashboardSearchSchema,
  component: () => (
    <RequirePermission permission={PERMISSIONS.expensesApprove}>
      <ManagerDashboard />
    </RequirePermission>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-8 py-12 text-center">
      <AlertTriangle
        aria-hidden="true"
        className="mx-auto size-10 text-destructive"
      />
      <h2 className="mt-4 text-lg font-semibold">Something went wrong</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        We couldn't load this page. Please try again, and if the issue persists
        contact your administrator.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-6"
        onClick={() => reset()}
      >
        Try again
      </Button>
      {import.meta.env.DEV && error?.message ? (
        <details className="mx-auto mt-6 max-w-xl text-left text-xs text-muted-foreground">
          <summary className="cursor-pointer">Error details (dev only)</summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3">
            {error.message}
          </pre>
        </details>
      ) : null}
    </div>
  ),
});

type Row = {
  approval: Doc<"approvals">;
  expense: Doc<"expenses"> | null;
  submitter: Doc<"users"> | null;
};

function ManagerDashboard() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const setSearch = (next: Partial<DashboardSearch>) => {
    void navigate({
      search: (prev: DashboardSearch) => ({ ...prev, ...next }),
      replace: false,
    });
  };

  const tableState: TableState = {
    page: search.page,
    pageSize: search.pageSize,
    sortBy: search.sortBy,
    sortDir: search.sortDir,
    cursors: search.cursors,
  };

  const queryArgs = useMemo(() => {
    const args: {
      paginationOpts: { numItems: number; cursor: string | null };
      state?: "pending" | "approved" | "rejected";
      fromMs?: number;
      toMs?: number;
      sortDir?: "asc" | "desc";
    } = {
      paginationOpts: {
        numItems: search.pageSize,
        cursor: cursorForPage(search.cursors, search.page),
      },
      sortDir: search.sortDir,
    };
    if (search.state !== "all") args.state = search.state;
    if (search.from) {
      const ms = Date.parse(search.from);
      if (!Number.isNaN(ms)) args.fromMs = ms;
    }
    if (search.to) {
      const ms = Date.parse(search.to);
      if (!Number.isNaN(ms)) args.toMs = ms + 24 * 60 * 60 * 1000 - 1;
    }
    return args;
  }, [
    search.page,
    search.pageSize,
    search.cursors,
    search.state,
    search.from,
    search.to,
    search.sortDir,
  ]);

  const result = useQuery(api.approvals.listMyDashboard, queryArgs);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        // Globally correct: `approvals.submittedAt` is denormalized and
        // indexed (`by_approver_and_submitted_at` and the state-narrowing
        // variant), so `.order(dir)` paginates correctly.
        id: "submittedAt",
        accessorFn: (row) => row.approval.submittedAt,
        header: "Submitted",
        enableSorting: true,
        cell: ({ row }) => {
          const ts = row.original.expense?.submittedAt;
          if (!ts) return "—";
          return (
            <span>
              {formatRelative(ts)}{" "}
              <span className="text-muted-foreground">
                ({formatDate(ts)})
              </span>
            </span>
          );
        },
      },
      {
        id: "submitter",
        header: "Submitter",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.submitter?.name ?? row.original.submitter?.email ?? "—",
      },
      {
        id: "description",
        header: "Description",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.expense
            ? truncate(row.original.expense.description, 50)
            : "—",
      },
      {
        id: "amount",
        header: "Amount",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.expense
            ? formatMoney(
                row.original.expense.amount,
                row.original.expense.currency,
              )
            : "—",
      },
      {
        id: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.expense ? (
            <StatusBadge status={row.original.expense.status} />
          ) : (
            "—"
          ),
      },
    ],
    [],
  );

  const filters = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Status
        </Label>
        <Select
          value={search.state}
          onValueChange={(v) =>
            setSearch({
              state: v as DashboardSearch["state"],
              page: 1,
              cursors: [],
            })
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label
          htmlFor="from-date"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          From
        </Label>
        <DatePicker
          id="from-date"
          value={search.from}
          maxDate={search.to}
          onChange={(v) => setSearch({ from: v, page: 1, cursors: [] })}
        />
      </div>
      <div className="space-y-1">
        <Label
          htmlFor="to-date"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          To
        </Label>
        <DatePicker
          id="to-date"
          value={search.to}
          minDate={search.from}
          onChange={(v) => setSearch({ to: v, page: 1, cursors: [] })}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Pending approvals and history of decisions you've made."
      />

      <DataTable
        columns={columns}
        data={result}
        state={tableState}
        onStateChange={setSearch}
        filters={filters}
        rowLink={(row) =>
          row.expense
            ? {
                to: "/expense/$expenseId",
                params: { expenseId: row.expense._id },
              }
            : null
        }
        emptyState={
          <EmptyState
            icon={Inbox}
            title={
              search.state === "pending" && !search.from && !search.to
                ? "Inbox zero"
                : "Nothing matches these filters"
            }
            description={
              search.state === "pending" && !search.from && !search.to
                ? "You have nothing waiting for your approval right now."
                : "Try widening the date range or switching status."
            }
          />
        }
      />
    </div>
  );
}
