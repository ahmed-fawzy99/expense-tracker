import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ALL_CURRENCIES, getCurrency, type Currency } from "@/lib/currencies";
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import * as React from "react";

interface CurrencySelectProps {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
}

const ROW_HEIGHT = 36;
const VIEWPORT_HEIGHT = 256;

/**
 * Currency picker.
 *
 * The full ISO-4217 list is rendered through a single `useVirtualizer`
 * scroll container — only ~10 rows are in the DOM at any moment regardless
 * of list length. The popular currencies are sorted first inside
 * `ALL_CURRENCIES` itself (see `src/lib/currencies.ts`), so there's no
 * special "Popular" section: the user sees them at the top simply because
 * they sit at the top of the dataset.
 *
 * Search filters by code or name (case-insensitive). The virtualizer
 * re-renders against the filtered slice without leaving any spacer
 * underneath the matches.
 */
export function CurrencySelect({
  value,
  onChange,
  disabled,
  placeholder = "Currency",
  className,
  id,
}: CurrencySelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selected = getCurrency(value);

  const filtered = React.useMemo<Currency[]>(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return ALL_CURRENCIES;
    return ALL_CURRENCIES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }, [query]);

  // Pin the scroll element in React state so the virtualizer re-renders
  // the moment the popover content mounts. With a plain `useRef` the
  // virtualizer caches `null` and `getVirtualItems()` returns []. The
  // explicit fixed `height` (not `max-height`) is also load-bearing —
  // TanStack Virtual reads `clientHeight` to decide which rows are in
  // view; a 0-tall element renders nothing.
  const [scrollEl, setScrollEl] = React.useState<HTMLDivElement | null>(null);

  // TanStack Virtual returns non-memoizable functions — same caveat as
  // TanStack Table. We don't pass these into other memoized hooks.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  // Reset scroll + virtualizer when the search query narrows or widens
  // the list — otherwise the user might see a tall empty area if their
  // current scroll offset is past the new totalSize.
  React.useEffect(() => {
    if (scrollEl) scrollEl.scrollTop = 0;
  }, [query, scrollEl]);

  function pick(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                <span className="font-mono text-xs text-muted-foreground">
                  {selected.symbol}
                </span>
                <span className="font-medium">{selected.code}</span>
              </>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="size-4 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 3-letter code or name…"
            className="h-7 border-none p-0 shadow-none focus-visible:ring-0"
            autoFocus
          />
        </div>

        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No matches.
          </p>
        ) : (
          <div
            ref={setScrollEl}
            style={{
              height: Math.min(VIEWPORT_HEIGHT, filtered.length * ROW_HEIGHT),
              overflowY: "auto",
              contain: "strict",
            }}
          >
            <div
              style={{
                height: rowVirtualizer.getTotalSize(),
                position: "relative",
                width: "100%",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((vi) => {
                const c = filtered[vi.index];
                return (
                  <div
                    key={c.code}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: vi.size,
                      transform: `translateY(${vi.start}px)`,
                    }}
                  >
                    <CurrencyRow
                      c={c}
                      selected={value === c.code}
                      onSelect={() => pick(c.code)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function CurrencyRow({
  c,
  selected,
  onSelect,
}: {
  c: Currency;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex h-9 w-full items-center justify-between px-3 text-left text-sm transition-colors hover:bg-accent cursor-pointer",
        selected && "bg-accent text-accent-foreground",
      )}
    >
      <span className="flex items-center gap-3 truncate">
        <span className="grid size-6 place-items-center rounded bg-muted font-mono text-[11px]">
          {c.symbol}
        </span>
        <span className="font-medium">{c.code}</span>
        <span className="truncate text-muted-foreground">{c.name}</span>
      </span>
      {selected ? (
        <Check className="size-4 text-secondary" aria-hidden="true" />
      ) : null}
    </button>
  );
}
