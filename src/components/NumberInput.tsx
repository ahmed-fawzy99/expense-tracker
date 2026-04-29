import * as React from "react";
import { Input } from "@/components/ui/input";

interface NumberInputProps
  extends Omit<React.ComponentProps<"input">, "type" | "onChange" | "value"> {
  value: string;
  onChange: (value: string) => void;
  /** Maximum decimal places. Default 2 (e.g. cents). */
  decimals?: number;
}

/**
 * Decimal-only input. Rejects everything except digits and a single decimal
 * separator. Intended for currency amounts — caller is responsible for
 * converting the major-unit string to minor-unit integer at submit time.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput({ value, onChange, decimals = 2, ...props }, ref) {
    function sanitize(next: string): string {
      // Strip everything except digits and dots.
      let cleaned = next.replace(/[^0-9.]/g, "");
      // Keep only the first dot.
      const firstDot = cleaned.indexOf(".");
      if (firstDot !== -1) {
        cleaned =
          cleaned.slice(0, firstDot + 1) +
          cleaned.slice(firstDot + 1).replace(/\./g, "");
      }
      // Cap decimals.
      if (firstDot !== -1) {
        const [whole, frac = ""] = cleaned.split(".");
        cleaned = `${whole}.${frac.slice(0, decimals)}`;
      }
      // Strip leading zeros except for "0" or "0.x"
      if (/^0\d/.test(cleaned)) cleaned = cleaned.replace(/^0+/, "");
      return cleaned;
    }

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(sanitize(e.target.value))}
        onKeyDown={(e) => {
          // Block "e", "E", "+", "-" — common HTML number-input gotchas.
          if (["e", "E", "+", "-"].includes(e.key)) {
            e.preventDefault();
          }
          props.onKeyDown?.(e);
        }}
        {...props}
      />
    );
  },
);
