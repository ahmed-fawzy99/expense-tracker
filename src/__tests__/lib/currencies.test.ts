import { describe, expect, it } from "vitest";
import {
  ALL_CURRENCIES,
  getCurrency,
  POPULAR_CURRENCY_CODES,
} from "@/lib/currencies";

describe("ALL_CURRENCIES", () => {
  it("starts with the popular codes in declared order", () => {
    const head = ALL_CURRENCIES.slice(0, POPULAR_CURRENCY_CODES.length).map(
      (c) => c.code,
    );
    expect(head).toEqual([...POPULAR_CURRENCY_CODES]);
  });

  it("contains a symbol for every entry", () => {
    for (const c of ALL_CURRENCIES) {
      expect(c.symbol.length).toBeGreaterThan(0);
    }
  });

  it("has unique codes", () => {
    const codes = ALL_CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("getCurrency", () => {
  it("looks up a code case-insensitively", () => {
    expect(getCurrency("usd")?.code).toBe("USD");
    expect(getCurrency("USD")?.code).toBe("USD");
  });

  it("returns undefined for an unknown code", () => {
    expect(getCurrency("ZZZ")).toBeUndefined();
  });
});
