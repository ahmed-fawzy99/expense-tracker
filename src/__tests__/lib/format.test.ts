import { describe, expect, it, vi, afterAll } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatRelative,
  truncate,
} from "@/lib/format";

describe("formatMoney", () => {
  it("formats USD minor units to a $-prefixed major-unit string", () => {
    expect(formatMoney(12345, "USD")).toMatch(/\$\s?123\.45/);
  });

  it("respects the supplied currency code regardless of case", () => {
    const upper = formatMoney(100, "EUR");
    const lower = formatMoney(100, "eur");
    expect(upper).toBe(lower);
  });

  it("falls back to bare-number rendering for an invalid code", () => {
    // A 2-letter code is rejected by Intl and triggers the catch branch.
    expect(formatMoney(50000, "ZZ")).toBe("500.00 ZZ");
  });

  it("handles zero amounts", () => {
    expect(formatMoney(0, "USD")).toMatch(/0\.00/);
  });
});

describe("formatDate / formatDateTime", () => {
  it("returns em-dash for null/undefined", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDateTime(null)).toBe("—");
  });

  it("renders a non-empty string for valid timestamps", () => {
    const ts = new Date("2026-04-29T12:00:00Z").getTime();
    expect(formatDate(ts)).not.toBe("—");
    expect(formatDateTime(ts)).toMatch(/\d/);
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-04-29T12:00:00Z").getTime();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  afterAll(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' under 60 seconds", () => {
    expect(formatRelative(now - 5_000)).toBe("just now");
  });

  it("renders minutes, plural and singular", () => {
    expect(formatRelative(now - 60_000)).toBe("1 minute ago");
    expect(formatRelative(now - 5 * 60_000)).toBe("5 minutes ago");
  });

  it("renders hours and days", () => {
    expect(formatRelative(now - 60 * 60_000)).toBe("1 hour ago");
    expect(formatRelative(now - 26 * 60 * 60_000)).toBe("1 day ago");
  });

  it("falls back to formatDate beyond 30 days", () => {
    const long = now - 60 * 24 * 60 * 60_000;
    expect(formatRelative(long)).not.toMatch(/ago$/);
  });
});

describe("truncate", () => {
  it("returns the input untouched when under the limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("appends an ellipsis when over the limit", () => {
    expect(truncate("abcdefghij", 5)).toBe("abcd…");
  });

  it("uses the default limit of 80 when not supplied", () => {
    const long = "a".repeat(100);
    expect(truncate(long)).toHaveLength(80);
    expect(truncate(long).endsWith("…")).toBe(true);
  });
});
