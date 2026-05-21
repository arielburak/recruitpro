import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat(currency === "ARS" ? "es-AR" : "en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Date-only formatting: treat the value as a "calendar day" and
// render it in UTC so it doesn't slip back a day in timezones west
// of UTC. Use this for Placement.startDate / paymentDueDate /
// guaranteeExpiry — values that the user typed as a date (no
// time-of-day intent) and that get stored as UTC midnight.
//
// Without this, '2026-05-21' submitted from Argentina (UTC-3) was
// rendering as '20/5/2026' because UTC midnight → 21:00 local on
// the previous day.
export function formatDateOnly(
  date: Date | string,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = new Date(date);
  return d.toLocaleDateString(locale, {
    timeZone: "UTC",
    ...options,
  });
}

// Add `days` to a yyyy-mm-dd date string without ever crossing into
// local-timezone math (which is what makes setDate/getDate flip the
// day across UTC). Pure string arithmetic via the Date UTC API.
export function addDaysToIsoDate(iso: string, days: number): string {
  if (!iso || !Number.isFinite(days)) return "";
  // Parse "YYYY-MM-DD" as UTC midnight.
  const d = new Date(iso + "T00:00:00.000Z");
  if (isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
