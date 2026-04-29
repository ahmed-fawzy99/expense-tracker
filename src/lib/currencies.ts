/**
 * ISO-4217 currency catalog used by `<CurrencySelect>`.
 *
 * The 8 popular codes (`POPULAR_CURRENCY_CODES`) are sorted to the top of
 * `ALL_CURRENCIES`, in the order listed. The picker doesn't render a
 * separate "Popular" section — it just trusts this ordering, which keeps
 * the dropdown a single virtualized list and makes the data layer the
 * single source of truth for "what's at the top".
 */

export interface Currency {
  /** ISO-4217 alpha-3 code, e.g. "USD". */
  code: string;
  /** Localized name, e.g. "US Dollar". */
  name: string;
  /** Glyph derived from `Intl.NumberFormat` at module load. */
  symbol: string;
}

/** Top-of-list currencies — surfaced first inside `ALL_CURRENCIES`. */
export const POPULAR_CURRENCY_CODES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "CAD",
  "AUD",
  "CNY",
] as const;

const RAW_CURRENCIES: Array<Omit<Currency, "symbol">> = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "AED", name: "UAE Dirham" },
  { code: "AFN", name: "Afghan Afghani" },
  { code: "ALL", name: "Albanian Lek" },
  { code: "AMD", name: "Armenian Dram" },
  { code: "ARS", name: "Argentine Peso" },
  { code: "AZN", name: "Azerbaijani Manat" },
  { code: "BAM", name: "Bosnia-Herzegovina Mark" },
  { code: "BDT", name: "Bangladeshi Taka" },
  { code: "BGN", name: "Bulgarian Lev" },
  { code: "BHD", name: "Bahraini Dinar" },
  { code: "BOB", name: "Bolivian Boliviano" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "BYN", name: "Belarusian Ruble" },
  { code: "CLP", name: "Chilean Peso" },
  { code: "COP", name: "Colombian Peso" },
  { code: "CRC", name: "Costa Rican Colón" },
  { code: "CZK", name: "Czech Koruna" },
  { code: "DKK", name: "Danish Krone" },
  { code: "DOP", name: "Dominican Peso" },
  { code: "DZD", name: "Algerian Dinar" },
  { code: "EGP", name: "Egyptian Pound" },
  { code: "GEL", name: "Georgian Lari" },
  { code: "GHS", name: "Ghanaian Cedi" },
  { code: "GTQ", name: "Guatemalan Quetzal" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "HNL", name: "Honduran Lempira" },
  { code: "HRK", name: "Croatian Kuna" },
  { code: "HUF", name: "Hungarian Forint" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "ILS", name: "Israeli Shekel" },
  { code: "INR", name: "Indian Rupee" },
  { code: "IQD", name: "Iraqi Dinar" },
  { code: "IRR", name: "Iranian Rial" },
  { code: "ISK", name: "Icelandic Króna" },
  { code: "JOD", name: "Jordanian Dinar" },
  { code: "KES", name: "Kenyan Shilling" },
  { code: "KGS", name: "Kyrgyzstani Som" },
  { code: "KHR", name: "Cambodian Riel" },
  { code: "KRW", name: "South Korean Won" },
  { code: "KWD", name: "Kuwaiti Dinar" },
  { code: "KZT", name: "Kazakhstani Tenge" },
  { code: "LBP", name: "Lebanese Pound" },
  { code: "LKR", name: "Sri Lankan Rupee" },
  { code: "MAD", name: "Moroccan Dirham" },
  { code: "MDL", name: "Moldovan Leu" },
  { code: "MKD", name: "Macedonian Denar" },
  { code: "MMK", name: "Burmese Kyat" },
  { code: "MNT", name: "Mongolian Tögrög" },
  { code: "MUR", name: "Mauritian Rupee" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "NAD", name: "Namibian Dollar" },
  { code: "NGN", name: "Nigerian Naira" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "NPR", name: "Nepalese Rupee" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "OMR", name: "Omani Rial" },
  { code: "PAB", name: "Panamanian Balboa" },
  { code: "PEN", name: "Peruvian Sol" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "PKR", name: "Pakistani Rupee" },
  { code: "PLN", name: "Polish Złoty" },
  { code: "PYG", name: "Paraguayan Guaraní" },
  { code: "QAR", name: "Qatari Riyal" },
  { code: "RON", name: "Romanian Leu" },
  { code: "RSD", name: "Serbian Dinar" },
  { code: "RUB", name: "Russian Ruble" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "THB", name: "Thai Baht" },
  { code: "TND", name: "Tunisian Dinar" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "TWD", name: "New Taiwan Dollar" },
  { code: "TZS", name: "Tanzanian Shilling" },
  { code: "UAH", name: "Ukrainian Hryvnia" },
  { code: "UGX", name: "Ugandan Shilling" },
  { code: "UYU", name: "Uruguayan Peso" },
  { code: "UZS", name: "Uzbekistani Som" },
  { code: "VES", name: "Venezuelan Bolívar" },
  { code: "VND", name: "Vietnamese Đồng" },
  { code: "XOF", name: "West African Franc" },
  { code: "XPF", name: "CFP Franc" },
  { code: "YER", name: "Yemeni Rial" },
  { code: "ZAR", name: "South African Rand" },
  { code: "ZMW", name: "Zambian Kwacha" },
];

function symbolFor(code: string): string {
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === "currency")?.value;
    return sym ?? code;
  } catch {
    return code;
  }
}

// Sort: popular codes (in declared order) first, then everything else
// in declared order. The picker reads this array as-is, so the popular
// codes appear at the top of the dropdown without a special section.
const popularSet = new Set<string>(POPULAR_CURRENCY_CODES);
const popularRanks = new Map<string, number>(
  POPULAR_CURRENCY_CODES.map((c, i) => [c, i]),
);
const sorted = [...RAW_CURRENCIES].sort((a, b) => {
  const ap = popularSet.has(a.code);
  const bp = popularSet.has(b.code);
  if (ap && bp) return popularRanks.get(a.code)! - popularRanks.get(b.code)!;
  if (ap) return -1;
  if (bp) return 1;
  return 0;
});

export const ALL_CURRENCIES: Currency[] = sorted.map((c) => ({
  ...c,
  symbol: symbolFor(c.code),
}));

const BY_CODE = new Map(ALL_CURRENCIES.map((c) => [c.code, c]));
export function getCurrency(code: string): Currency | undefined {
  return BY_CODE.get(code.toUpperCase());
}
