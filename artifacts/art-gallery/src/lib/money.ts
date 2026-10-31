/**
 * Money formatting.
 *
 * Prices are `numeric(12,2)` in PostgreSQL and plain JS numbers over the wire
 * (see lib/db/src/schema/_money.ts). They may carry paisa, so never render one
 * with a bare `.toLocaleString()` — that prints `68000.5` as "68,000.5".
 */

export const BASE_CURRENCY = "PKR";

/** Symbol the gallery renders prices with. */
const SYMBOL: Record<string, string> = {
  PKR: "Rs.",
  AED: "AED",
  USD: "$",
  GBP: "£",
  EUR: "€",
};

/**
 * `Rs. 68,000` for whole amounts, `Rs. 68,000.50` when there are paisa.
 * Returns the fallback for null — an artwork with no display price is
 * "Price on Request", not "Rs. 0".
 */
export function formatMoney(
  value: number | null | undefined,
  options: { currency?: string; fallback?: string } = {},
): string {
  const { currency = BASE_CURRENCY, fallback = "Price on Request" } = options;
  if (value == null || Number.isNaN(value)) return fallback;

  const hasFraction = Math.abs(value % 1) > 0.0001;
  const formatted = value.toLocaleString("en-PK", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });

  return `${SYMBOL[currency] ?? currency} ${formatted}`;
}

/** Sum a list of amounts without accumulating float drift. */
export function sumMoney(values: readonly (number | null | undefined)[]): number {
  const paisa = values.reduce<number>((acc, v) => acc + Math.round((v ?? 0) * 100), 0);
  return paisa / 100;
}
