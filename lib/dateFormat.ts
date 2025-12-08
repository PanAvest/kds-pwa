// File: lib/dateFormat.ts
const DATE_LOCALE = "en-GB";
const DATE_TZ = "Africa/Accra";

const dateFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: DATE_TZ,
});

const dateTimeFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: DATE_TZ,
});

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return dateFormatter.format(d);
}

export function formatDateTime(
  value: string | Date | null | undefined
): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return dateTimeFormatter.format(d);
}
