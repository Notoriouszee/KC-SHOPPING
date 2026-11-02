/** Money helpers. Prices are stored as integer kobo (1 naira = 100 kobo). */

export const NAIRA = "\u20A6";

export function formatNaira(kobo: number, options: { alwaysDecimals?: boolean } = {}): string {
  const safe = Number.isFinite(kobo) ? kobo : 0;
  const negative = safe < 0;
  const absolute = Math.abs(Math.round(safe));
  const naira = Math.floor(absolute / 100);
  const koboPart = absolute % 100;

  const grouped = naira.toLocaleString("en-NG");
  const showDecimals = options.alwaysDecimals === true || koboPart !== 0;
  const body = showDecimals ? `${grouped}.${String(koboPart).padStart(2, "0")}` : grouped;

  return `${negative ? "-" : ""}${NAIRA}${body}`;
}

/**
 * Parses seller/customer input such as "12,500", "\u20A612500.50" or " 12500 "
 * into kobo. Returns null when the input is not a usable amount.
 */
export function parseNairaToKobo(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) return null;
    return Math.round(input * 100);
  }

  const cleaned = input
    .replace(/\u20A6/g, "")
    .replace(/NGN/gi, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Multiplies a unit price by a positive integer quantity. */
export function lineTotal(unitPriceKobo: number, quantity: number): number {
  return Math.round(unitPriceKobo) * Math.max(0, Math.trunc(quantity));
}

export function sumKobo(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
