/**
 * Formats an integer minor-unit amount + ISO-4217 currency code as a
 * locale-formatted string. Always pass minor units; never pre-divide.
 *
 * Example: formatMoney(12345, "USD") → "$123.45"
 */
export function formatMoney(minor: number, currency: string): string {
  // 2 decimal places is correct for ~all currencies we'll encounter in v1.
  const major = minor / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(major);
  } catch {
    // Unknown currency code — fall back to bare-number rendering.
    return `${major.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/**
 * Formats a millisecond timestamp as a short, locale-aware date.
 * Returns "—" for null/undefined.
 */
export function formatDate(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

/**
 * Formats a millisecond timestamp as a date + time string.
 */
export function formatDateTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

/**
 * Relative time: "3 days ago", "just now", etc.
 */
export function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return formatDate(ms);
}

/**
 * Truncates a string to a max length with an ellipsis, used in row titles.
 */
export function truncate(s: string, max = 80): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
