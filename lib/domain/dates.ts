/** Date formatting for a Nigerian audience (West Africa Time, UTC+1). */

const TIME_ZONE = "Africa/Lagos";

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-NG", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const shortTimeFormatter = new Intl.DateTimeFormat("en-NG", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatter.format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}

export function formatTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return shortTimeFormatter.format(date);
}

export function relativeDay(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfTarget - startOfToday) / (24 * 60 * 60 * 1000));

  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days < 7) return `In ${days} days`;
  return formatDate(date);
}

/** yyyy-MM-dd in local time, for prefilling <input type="date">. */
export function toDateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toDateTimeInputValue(value: Date): string {
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${toDateInputValue(value)}T${hours}:${minutes}`;
}

export function isOverdue(value: string): boolean {
  return new Date(value).getTime() < Date.now();
}
