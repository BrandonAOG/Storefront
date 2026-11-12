import Link from "next/link";
import { desc, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CustomersAdmin({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const c = schema.customers;
  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const rows = await db()
    .select({
      c,
      orders: sql<number>`(select count(*)::int from orders o where o.customer_id = ${c.id} and o.status <> 'cancelled')`,
      spent: sql<number>`(select coalesce(sum(o.subtotal_cents), 0)::int from orders o where o.customer_id = ${c.id} and o.status in ('confirmed','completed'))`,
    })
    .from(c)
    .where(q ? or(ilike(c.name, like), ilike(c.email, like), ilike(c.phone, like)) : undefined)
    .orderBy(desc(c.lastActivityAt))
    .limit(200);
  return (
    <>
      <h1 className="text-2xl font-bold">Customers</h1>
      <form className="mt-3 flex max-w-md gap-2">
        <input className="input" name="q" defaultValue={q} placeholder="Search name, email or phone" aria-label="Search customers" />
        <button className="btn btn-ghost">Search</button>
      </form>
      <div className="card mt-4 overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Customer</th><th>Contact</th><th>Bookings</th><th>Booked value</th><th>Came from</th><th>Last activity</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="text-slate-500">No customers found.</td></tr>}
            {rows.map(({ c: r, orders, spent }) => (
              <tr key={r.id}>
                <td><Link className="font-semibold underline" href={`/admin/customers/${r.id}`}>{r.name || r.email}</Link><br /><span className="text-slate-500">{r.city} {r.zip}</span></td>
                <td>{r.phone}<br /><span className="text-slate-500">{r.email}</span></td>
                <td>{orders}</td>
                <td>{money(spent)}</td>
                <td>{r.source}{r.campaign && <span className="block text-slate-500">{r.campaign}</span>}</td>
                <td>{fmtDateTime(r.lastActivityAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
