import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Settings } from "@/db/schema";
import { TIME_ZONE } from "./format";

/** Minutes an unpaid checkout keeps its arrival window reserved. */
export const HOLD_MINUTES = 30;

export type Slot = { startMin: number; endMin: number; available: boolean };
export type DaySlots = { day: string; slots: Slot[] };

export function todayLocal(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** SQL condition: the order still occupies its window (confirmed, or a recent unpaid hold). */
export const occupiesSlot = sql`(
  ${schema.orders.status} in ('confirmed', 'completed')
  or (${schema.orders.status} = 'pending' and ${schema.orders.createdAt} > now() - make_interval(mins => ${HOLD_MINUTES}))
)`;

/** Every bookable arrival window in the booking horizon, with remaining capacity. */
export async function getAvailability(s: Settings, extraLeadDays = 0): Promise<DaySlots[]> {
  const first = addDays(todayLocal(), Math.max(0, s.leadDays, extraLeadDays));
  const last = addDays(first, Math.max(1, s.horizonDays) - 1);

  const [hourRows, blackoutRows, taken] = await Promise.all([
    db().select().from(schema.hours),
    db().select().from(schema.blackouts).where(and(gte(schema.blackouts.day, first), lte(schema.blackouts.day, last))),
    db()
      .select({ day: schema.orders.day, startMin: schema.orders.startMin, n: sql<number>`count(*)::int` })
      .from(schema.orders)
      .where(and(gte(schema.orders.day, first), lte(schema.orders.day, last), occupiesSlot))
      .groupBy(schema.orders.day, schema.orders.startMin),
  ]);

  const hoursByDay = new Map(hourRows.map((h) => [h.weekday, h]));
  const closed = new Set(blackoutRows.map((b) => b.day));
  const used = new Map(taken.map((t) => [`${t.day}|${t.startMin}`, t.n]));
  const step = Math.max(30, s.slotMinutes);

  const out: DaySlots[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) {
    const h = hoursByDay.get(weekdayOf(day));
    if (!h || !h.open || closed.has(day)) continue;
    const slots: Slot[] = [];
    for (let start = h.startMin; start + step <= h.endMin; start += step) {
      slots.push({
        startMin: start,
        endMin: start + step,
        available: (used.get(`${day}|${start}`) ?? 0) < s.slotCapacity,
      });
    }
    if (slots.length) out.push({ day, slots });
  }
  return out;
}

/** Is this exact window one the business offers? (Capacity is checked separately, under a lock.) */
export async function findSlot(s: Settings, day: string, startMin: number, extraLeadDays = 0): Promise<Slot | null> {
  const all = await getAvailability(s, extraLeadDays);
  return all.find((d) => d.day === day)?.slots.find((x) => x.startMin === startMin) ?? null;
}

export async function countOccupied(tx: Pick<ReturnType<typeof db>, "select">, day: string, startMin: number) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.orders)
    .where(and(eq(schema.orders.day, day), eq(schema.orders.startMin, startMin), occupiesSlot));
  return row?.n ?? 0;
}
