/** Formatting helpers that are safe to use on both server and client. */

export const TIME_ZONE = "America/New_York";

export function money(cents: number): string {
  const whole = cents % 100 === 0;
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
  });
}

/** Shown wherever a service has no listed price. */
export const NO_PRICE = "Price confirmed before work begins";

export function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function fmtWindow(startMin: number, endMin: number): string {
  return `${fmtTime(startMin)} – ${fmtTime(endMin)}`;
}

/** "2026-11-12" -> "Thu, Nov 12" (no timezone shifting: the string is a calendar day). */
export function fmtDay(day: string, long = false): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: long ? "long" : "short",
    month: long ? "long" : "short",
    day: "numeric",
    ...(long ? { year: "numeric" } : {}),
  });
}

export function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-US", { timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short" });
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
