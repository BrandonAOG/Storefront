import Link from "next/link";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Status } from "@/components/admin";
import { requireAdmin } from "@/lib/auth";
import { fmtDay, fmtWindow, money } from "@/lib/format";
import { todayLocal } from "@/lib/slots";
import { stripeEnabled } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  await requireAdmin();
  const today = todayLocal();
  const [upcoming, [paid], [newVisits], [activePlans], [pendingPlans]] = await Promise.all([
    db().select().from(schema.orders).where(and(gte(schema.orders.day, today), eq(schema.orders.status, "confirmed"))).orderBy(asc(schema.orders.day), asc(schema.orders.startMin)).limit(10),
    db().select({ total: sql<number>`coalesce(sum(${schema.orders.dueNowCents}), 0)::int`, n: sql<number>`count(*)::int` }).from(schema.orders).where(and(eq(schema.orders.paymentStatus, "paid"), sql`${schema.orders.createdAt} > now() - interval '30 days'`)),
    db().select({ n: sql<number>`count(*)::int` }).from(schema.visits).where(eq(schema.visits.status, "new")),
    db().select({ n: sql<number>`count(*)::int` }).from(schema.memberships).where(eq(schema.memberships.status, "active")),
    db().select({ n: sql<number>`count(*)::int` }).from(schema.memberships).where(inArray(schema.memberships.status, ["pending"])),
  ]);
  const stats: [string, string, string][] = [
    ["Collected online, last 30 days", money(paid.total), `${paid.n} paid booking${paid.n === 1 ? "" : "s"}`],
    ["New virtual visit requests", String(newVisits.n), "waiting for a reply"],
    ["Active memberships", String(activePlans.n), `${pendingPlans.n} pending`],
  ];
  return (
    <>
      <h1 className="text-2xl font-bold">Overview</h1>
      {!stripeEnabled() && <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Online payment is off because no Stripe key is set. Bookings are confirmed without payment and plan sign-ups arrive as requests.</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {stats.map(([label, value, sub]) => (
          <div key={label} className="card">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-3xl font-bold">{value}</p>
            <p className="text-sm text-slate-500">{sub}</p>
          </div>
        ))}
      </div>
      <h2 className="mt-8 text-lg font-bold">Upcoming jobs</h2>
      <div className="card mt-3 overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>When</th><th>Customer</th><th>Address</th><th>Total</th><th>Payment</th></tr></thead>
          <tbody>
            {upcoming.length === 0 && <tr><td colSpan={5} className="text-slate-500">No upcoming jobs.</td></tr>}
            {upcoming.map((o) => (
              <tr key={o.id}>
                <td><Link className="font-semibold underline" href={`/admin/orders/${o.id}`}>{fmtDay(o.day)}</Link><br />{fmtWindow(o.startMin, o.endMin)}</td>
                <td>{o.name}<br /><span className="text-slate-500">{o.phone}</span></td>
                <td>{o.address}<br />{o.city} {o.zip}</td>
                <td>{money(o.subtotalCents)}</td>
                <td><Status value={o.paymentStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
