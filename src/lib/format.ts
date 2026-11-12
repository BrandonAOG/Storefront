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

/** "Thursday, November 19 at 2:00 PM" in the business's time zone. */
export function fmtAppointment(d: Date): string {
  const day = d.toLocaleDateString("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

/** Wall-clock parts of an instant in the business's time zone. */
function zoneParts(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** For filling date and time inputs from a stored instant. */
export const zoneDay = (d: Date) => zoneParts(d).day;
export const zoneTime = (d: Date) => zoneParts(d).time;

/**
 * Turns a date and time typed in the business's time zone ("2026-11-19",
 * "14:00") into the exact instant, allowing for daylight saving time.
 */
export function zoneToDate(day: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const wanted = Date.parse(`${day}T${time}:00Z`);
  if (Number.isNaN(wanted)) return null;
  // Start by pretending the wall time is UTC, then correct by the zone's offset at that moment (twice, to settle across DST changes).
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const shown = zoneParts(new Date(guess));
    guess += wanted - Date.parse(`${shown.day}T${shown.time}:00Z`);
  }
  return new Date(guess);
}
