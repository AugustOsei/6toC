const DAY_MS = 86_400_000;

export function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addCalendarMonths(value: string | Date, months: number): Date {
  const source = typeof value === "string" ? parseLocalDate(value) : value;
  const result = new Date(source.getFullYear(), source.getMonth(), 1);
  const targetMonth = source.getMonth() + months;
  result.setMonth(targetMonth);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(source.getDate(), lastDay));
  return result;
}

export function daysBetween(from: string | Date, to: string | Date): number {
  const start = typeof from === "string" ? parseLocalDate(from) : from;
  const end = typeof to === "string" ? parseLocalDate(to) : to;
  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.ceil((utcEnd - utcStart) / DAY_MS);
}

export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(parseLocalDate(value));
}

export function clampDate(value: Date, min: Date, max: Date): Date {
  return new Date(Math.min(Math.max(value.getTime(), min.getTime()), max.getTime()));
}
