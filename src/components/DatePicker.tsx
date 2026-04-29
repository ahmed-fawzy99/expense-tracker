import { useState } from "react";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  /** ISO `yyyy-MM-dd` string, or undefined for no selection. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  /** Optional bound — disables earlier dates. ISO `yyyy-MM-dd`. */
  minDate?: string;
  /** Optional bound — disables later dates. */
  maxDate?: string;
}

/**
 * shadcn-styled date picker. Stores the selected day as an ISO date string
 * (`yyyy-MM-dd`) so callers can drop it straight into URL search params.
 * Uses local-time parsing to avoid the off-by-one timezone trap when the
 * user picks a day in their own zone.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  id,
  className,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseLocalIso(value) : undefined;
  const min = minDate ? parseLocalIso(minDate) : undefined;
  const max = maxDate ? parseLocalIso(maxDate) : undefined;

  return (
    <div className={cn("relative inline-block", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              "w-44 justify-start pr-8 font-normal",
              !selected && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="size-4" aria-hidden="true" />
            {selected ? format(selected, "PP") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => {
              onChange(d ? format(d, "yyyy-MM-dd") : undefined);
              setOpen(false);
            }}
            disabled={(d) => {
              if (min && d < min) return true;
              if (max && d > max) return true;
              return false;
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      {selected ? (
        <button
          type="button"
          aria-label="Clear date"
          onClick={() => onChange(undefined)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** Parses `yyyy-MM-dd` as a local-time date — `new Date("2026-04-26")` would
 * read it as UTC and shift by the local offset. */
function parseLocalIso(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
