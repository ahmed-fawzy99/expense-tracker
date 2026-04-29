import { useMemo } from "react";
import {
  Navigate,
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Plus, Receipt } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { PERMISSIONS } from "../../convex/lib/authConstants";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, type TableState } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { RequireAuth } from "@/lib/route-guards";
import { useMe } from "@/hooks/useMe";
import { formatDate, formatMoney, truncate } from "@/lib/format";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
} from "../../convex/categoryList";
import { EXPENSE_STATUSES } from "@/lib/status";
import { tableSearchSchema, cursorForPage } from "@/lib/table-search";

const homeSearchSchema = tableSearchSchema.extend({
  status: z
    .enum(["all", ...EXPENSE_STATUSES])
    .catch("all")
    .default("all"),
  category: z
    .enum(["all", ...EXPENSE_CATEGORIES])
    .catch("all")
    .default("all"),
  sortDir: z.enum(["asc", "desc"]).catch("desc").default("desc"),
});

type HomeSearch = z.infer<typeof homeSearchSchema>;

export const Route = createFileRoute("/")({
  validateSearch: homeSearchSchema,
  component: () => (
    <RequireAuth>
      <Home />
    </RequireAuth>
  ),
});

function Home() {
  const me = useMe();
  if (me === undefined) {
    return <Skeleton className="h-48 w-full" />;
  }
  if (me === null) return <Navigate to="/auth/login" />;

  const isUnmanaged = me.user.managerId === null;
  if (isUnmanaged && me.permissions.includes(PERMISSIONS.expensesApprove)) {
    return <Navigate to="/expenses" replace />;
  }

  return <MyExpenses />;
}

function MyExpenses() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const setSearch = (next: Partial<HomeSearch>) => {
    void navigate({
      search: (prev: HomeSearch) => ({ ...prev, ...next }),
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

  const queryArgs = useMemo(
    () => ({
      paginationOpts: {
        numItems: search.pageSize,
        cursor: cursorForPage(search.cursors, search.page),
      },
      status: search.status === "all" ? undefined : search.status,
      category: search.category === "all" ? undefined : search.category,
      sortDir: search.sortDir,
    }),
    [
      search.page,
      search.pageSize,
      search.cursors,
      search.status,
      search.category,
      search.sortDir,
    ],
  );

  const result = useQuery(api.expenses.listMine, queryArgs);

  const columns = useMemo<ColumnDef<Doc<"expenses">, unknown>[]>(
    () => [
      {
        // Only `submittedAt` is sortable across pages: it's the natural
        // order of `by_submitter_and_submitted_at` (used when no
        // status/category filter is active). Other columns would only
        // sort within a page, which produces wrong global ordering.
        id: "submittedAt",
        accessorFn: (row) => row.submittedAt ?? 0,
        header: "Submission Date",
        enableSorting:
          search.status === "all" && search.category === "all",
        cell: ({ row }) => formatDate(row.original.submittedAt),
      },
      {
        id: "description",
        header: "Description",
        enableSorting: false,
        cell: ({ row }) => truncate(row.original.description, 60),
      },
      {
        id: "amount",
        header: "Amount",
        enableSorting: false,
        cell: ({ row }) =>
          formatMoney(row.original.amount, row.original.currency),
      },
      {
        id: "category",
        header: "Category",
        enableSorting: false,
        cell: ({ row }) =>
          EXPENSE_CATEGORY_LABELS[
            row.original.category as keyof typeof EXPENSE_CATEGORY_LABELS
          ] ?? row.original.category,
      },
      {
        id: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [search.status, search.category],
  );

  const filters = (
    <div className="flex flex-wrap gap-2">
      <Select
        value={search.status}
        onValueChange={(v) =>
          setSearch({
            status: v as HomeSearch["status"],
            page: 1,
            cursors: [],
          })
        }
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {EXPENSE_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={search.category}
        onValueChange={(v) =>
          setSearch({
            category: v as HomeSearch["category"],
            page: 1,
            cursors: [],
          })
        }
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {EXPENSE_CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>
              {EXPENSE_CATEGORY_LABELS[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Expenses"
        description="Track everything you've submitted, in draft, or already decided."
        actions={
          <Button asChild>
            <Link to="/new">
              <Plus className="size-4" aria-hidden="true" />
              New Expense
            </Link>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={result}
        state={tableState}
        onStateChange={setSearch}
        filters={filters}
        rowLink={(row) => ({
          to: "/expense/$expenseId",
          params: { expenseId: row._id },
        })}
        emptyState={
          search.status === "all" && search.category === "all" ? (
            <EmptyState
              icon={Receipt}
              title="No expenses yet"
              description="When you create or submit expenses, they'll show up here."
              action={
                <Button asChild>
                  <Link to="/new">Create your first one</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Receipt}
              title="Nothing matches these filters"
              description="Try widening the filters above."
            />
          )
        }
      />
    </div>
  );
}
