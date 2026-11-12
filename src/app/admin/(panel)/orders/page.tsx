import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Status } from "@/components/admin";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, fmtDay, fmtWindow, money } from "@/lib/format";

export const dynamic = "force-dynamic";
const FILTERS = ["all", "confirmed", "pending", "completed", "cancelled"];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin();
  const { status } = await searchParams;
  const filter = FILTERS.includes(status ?? "") ? status! : "all";
  const base = db().select().from(schema.orders);
  const rows = await (filter === "all" ? base : base.where(eq(schema.orders.status, filter))).orderBy(desc(schema.orders.createdAt)).limit(200);
  return (
    <>
      <h1 className="text-2xl font-bold">Bookings</h1>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link key={f} href={f === "all" ? "/admin/orders" : `/admin/orders?status=${f}`} className={`rounded-full px-3 py-1 font-semibold capitalize ${f === filter ? "bg-ink text-white" : "bg-slate-200 text-slate-700"}`}>{f}</Link>
        ))}
      </div>
      <div className="card mt-4 overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Booked</th><th>Job date</th><th>Customer</th><th>Total</th><th>Status</th><th>Payment</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="text-slate-500">No bookings yet.</td></tr>}
            {rows.map((o) => (
              <tr key={o.id}>
                <td><Link className="font-semibold underline" href={`/admin/orders/${o.id}`}>{fmtDateTime(o.createdAt)}</Link></td>
                <td>{fmtDay(o.day)}<br />{fmtWindow(o.startMin, o.endMin)}</td>
                <td>{o.name}<br /><span className="text-slate-500">{o.city} {o.zip}</span></td>
                <td>{money(o.subtotalCents)}</td>
                <td><Status value={o.status} /></td>
                <td><Status value={o.paymentStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
