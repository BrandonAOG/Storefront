import { asc, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { Saved } from "@/components/admin";
import { requireAdmin } from "@/lib/auth";
import { fmtDay, WEEKDAYS } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { todayLocal } from "@/lib/slots";
import { addBlackout, removeBlackout, saveScheduling } from "../../actions";

export const dynamic = "force-dynamic";
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export default async function AvailabilityAdmin({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin();
  const [s, hourRows, blackouts] = await Promise.all([
    getSettings(),
    db().select().from(schema.hours),
    db().select().from(schema.blackouts).where(gte(schema.blackouts.day, todayLocal())).orderBy(asc(schema.blackouts.day)),
  ]);
  const byDay = new Map(hourRows.map((h) => [h.weekday, h]));
  return (
    <>
      <h1 className="text-2xl font-bold">Availability</h1>
      <div className="mt-4"><Saved show={(await searchParams).saved === "1"} /></div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <form action={saveScheduling} className="card">
          <h2 className="font-bold">Booking rules</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label><span className="label">Arrival window length (minutes)</span><input className="input" type="number" name="slotMinutes" min={30} max={720} step={15} defaultValue={s.slotMinutes} /></label>
            <label><span className="label">Jobs per window (crews)</span><input className="input" type="number" name="slotCapacity" min={1} max={50} defaultValue={s.slotCapacity} /></label>
            <label><span className="label">Earliest booking (days from today)</span><input className="input" type="number" name="leadDays" min={0} max={60} defaultValue={s.leadDays} /></label>
            <label><span className="label">How far ahead (days)</span><input className="input" type="number" name="horizonDays" min={1} max={180} defaultValue={s.horizonDays} /></label>
          </div>
          <h2 className="mt-6 font-bold">Weekly hours</h2>
          <div className="mt-3 space-y-2">
            {WEEKDAYS.map((name, weekday) => {
              const h = byDay.get(weekday);
              return (
                <div key={name} className="grid grid-cols-[auto_1fr_1fr] items-center gap-3 sm:grid-cols-[140px_1fr_1fr]">
                  <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name={`open-${weekday}`} defaultChecked={h?.open ?? false} /> {name}</label>
                  <input className="input" type="time" name={`start-${weekday}`} aria-label={`${name} opens`} defaultValue={hhmm(h?.startMin ?? 480)} />
                  <input className="input" type="time" name={`end-${weekday}`} aria-label={`${name} closes`} defaultValue={hhmm(h?.endMin ?? 960)} />
                </div>
              );
            })}
          </div>
          <button className="btn btn-dark mt-5">Save availability</button>
        </form>

        <div className="card h-fit">
          <h2 className="font-bold">Days off</h2>
          <p className="mt-1 text-sm text-slate-600">Holidays or days you&apos;re fully booked. Customers can&apos;t pick these.</p>
          <form action={addBlackout} className="mt-3 space-y-2">
            <input className="input" type="date" name="day" required min={todayLocal()} aria-label="Day off" />
            <input className="input" name="note" maxLength={120} placeholder="Note (optional)" aria-label="Note" />
            <button className="btn btn-ghost w-full">Add day off</button>
          </form>
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {blackouts.map((b) => (
              <li key={b.day} className="flex items-center justify-between gap-2 py-2">
                <span>{fmtDay(b.day, true)}{b.note && <span className="block text-slate-500">{b.note}</span>}</span>
                <form action={removeBlackout}><input type="hidden" name="day" value={b.day} /><button className="text-red-700 underline">Remove</button></form>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
