import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PAGE_SIZE_OPTIONS } from "@/lib/table-search";
import { cn } from "@/lib/utils";
import { Link, type LinkProps } from "@tanstack/react-router";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronUp,
} from "lucide-react";
import { type ReactNode } from "react";

type RowLinkProps = Pick<LinkProps, "to" | "params" | "search">;

/**
 * Convex paginate() envelope — the only data shape this table consumes.
 */
export interface PaginatedData<T> {
  page: T[];
  isDone: boolean;
  continueCursor: string;
}

export interface TableState {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  cursors: string[];
}

interface DataTableProps<T> {
  /** Column defs. Set `id` (or accessorKey) for sortable columns. */
  columns: ColumnDef<T, unknown>[];
  /** `undefined` while loading; otherwise the Convex page envelope. */
  data: PaginatedData<T> | undefined;
  /** Current URL-driven state. */
  state: TableState;
  /** Callback to merge a partial state update into the URL. */
  onStateChange: (next: Partial<TableState>) => void;
  /** Optional filter controls rendered above the table. */
  filters?: ReactNode;
  /** Optional row-click link. */
  rowLink?: (row: T) => RowLinkProps | null;
  /** Empty-state node when the page is empty AND no filters are active. */
  emptyState: ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  state,
  onStateChange,
  filters,
  rowLink,
  emptyState,
}: DataTableProps<T>) {
  const sorting: SortingState = state.sortBy
    ? [{ id: state.sortBy, desc: state.sortDir !== "asc" }]
    : [];

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data?.page ?? [],
    columns,
    state: { sorting },
    manualPagination: true,
    manualSorting: true,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      onStateChange({
        sortBy: first?.id,
        sortDir: first ? (first.desc ? "desc" : "asc") : undefined,
        page: 1,
        cursors: [],
      });
    },
    getCoreRowModel: getCoreRowModel(),
  });

  const isLoading = data === undefined;
  const isFirstPage = state.page === 1 && state.cursors.length === 0;
  const isEmpty = !isLoading && data.page.length === 0;
  // Hero empty state replaces the whole surface when there's literally
  // nothing yet (page 1, no cursor, no rows). We still render the filters
  // above it so the caller can swap in a "Filtered, but empty" message
  // by toggling the emptyState node based on whether any filter is set.
  const showHero = isEmpty && isFirstPage;

  function handlePrev() {
    if (state.page <= 1) return;
    onStateChange({
      page: state.page - 1,
      cursors: state.cursors.slice(0, state.page - 2),
    });
  }

  function handleNext() {
    if (!data || data.isDone) return;
    onStateChange({
      page: state.page + 1,
      cursors: [...state.cursors, data.continueCursor],
    });
  }

  function handleFirst() {
    if (state.page === 1) return;
    onStateChange({ page: 1, cursors: [] });
  }

  function handlePageSize(size: number) {
    if (size === state.pageSize) return;
    onStateChange({ pageSize: size, page: 1, cursors: [] });
  }

  const canPrev = state.page > 1;
  const canNext = !!data && !data.isDone;

  if (showHero) {
    return (
      <div className="space-y-4">
        {filters}
        {emptyState}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filters}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortState = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(canSort && "cursor-pointer select-none")}
                      onClick={
                        canSort
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                    >
                      <div className="flex items-center gap-1">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                        {sortState === "asc" ? (
                          <ChevronUp className="size-3" aria-hidden="true" />
                        ) : sortState === "desc" ? (
                          <ChevronDown className="size-3" aria-hidden="true" />
                        ) : null}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {columns.map((_c, j) => (
                    <TableCell key={j} className="px-3 py-2.5">
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.page.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No results.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const link = rowLink?.(row.original) ?? null;
                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      link &&
                        "cursor-pointer transition-colors hover:bg-muted/40",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="p-0">
                        {link ? (
                          <Link
                            {...(link as Parameters<typeof Link>[0])}
                            className="block px-3 py-2.5"
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </Link>
                        ) : (
                          <div className="px-3 py-2.5">
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </div>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Label
            htmlFor="rows-per-page"
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Rows per page
          </Label>
          <Select
            value={String(state.pageSize)}
            onValueChange={(v) => handlePageSize(Number(v))}
          >
            <SelectTrigger size="sm" className="w-20" id="rows-per-page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Page {state.page}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              onClick={handleFirst}
              disabled={!canPrev}
              aria-label="First page"
            >
              <ChevronsLeft className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              onClick={handlePrev}
              disabled={!canPrev}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              onClick={handleNext}
              disabled={!canNext}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
