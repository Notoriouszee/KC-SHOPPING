/** Shared input validation used by server actions and the public order form. */

export type FieldError = { field: string; message: string };

export class ValidationError extends Error {
  fields: FieldError[];

  constructor(fields: FieldError[]) {
    super(fields.map((entry) => entry.message).join(" "));
    this.name = "ValidationError";
    this.fields = fields;
  }
}

export function requiredString(
  value: FormDataEntryValue | string | null | undefined,
  field: string,
  label: string,
  options: { min?: number; max?: number } = {},
): string {
  const text = typeof value === "string" ? value.trim() : "";
  const min = options.min ?? 1;
  const max = options.max ?? 500;
  if (text.length < min) {
    throw new ValidationError([{ field, message: `${label} is required.` }]);
  }
  if (text.length > max) {
    throw new ValidationError([{ field, message: `${label} must be under ${max} characters.` }]);
  }
  return text;
}

export function optionalString(
  value: FormDataEntryValue | string | null | undefined,
  max = 2000,
): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (text === "") return null;
  return text.slice(0, max);
}

/**
 * Normalises Nigerian mobile numbers to `0XXXXXXXXXX`. Accepts local, +234 and
 * 234-prefixed input with spaces, dashes or brackets. Returns null if the
 * number does not look dialable.
 */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (digits === "") return null;

  let local = digits;
  if (local.startsWith("234") && local.length === 13) local = `0${local.slice(3)}`;
  if (local.length === 10 && /^[789]/.test(local)) local = `0${local}`;

  if (!/^0\d{10}$/.test(local)) {
    // Allow international numbers that are clearly not Nigerian, still dialable.
    if (/^\d{7,15}$/.test(digits)) return digits;
    return null;
  }
  return local;
}

export function requirePhone(raw: string | null | undefined, field = "phone"): string {
  const value = typeof raw === "string" ? normalisePhone(raw) : null;
  if (!value) {
    throw new ValidationError([
      { field, message: "Enter a valid phone number, for example 0803 123 4567." },
    ]);
  }
  return value;
}

export function requirePositiveInt(raw: unknown, field: string, label: string): number {
  const value = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError([{ field, message: `${label} must be a whole number of 1 or more.` }]);
  }
  if (value > 1000) {
    throw new ValidationError([{ field, message: `${label} looks too large for one order.` }]);
  }
  return value;
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
}

export function firstFieldErrors(error: unknown): Record<string, string> {
  if (error instanceof ValidationError) {
    const map: Record<string, string> = {};
    for (const entry of error.fields) {
      if (!map[entry.field]) map[entry.field] = entry.message;
    }
    return map;
  }
  return {};
}
