import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Status } from "@/components/admin";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function QuotesAdmin() {
  await requireAdmin();
  const rows = await db()
    .select({ q: schema.quotes, name: schema.customers.name, email: schema.customers.email })
    .from(schema.quotes)
    .leftJoin(schema.customers, eq(schema.customers.id, schema.quotes.customerId))
    .orderBy(desc(schema.quotes.createdAt))
    .limit(200);
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Estimates</h1>
        <Link href="/admin/quotes/new" className="btn btn-primary">New estimate</Link>
      </div>
      <div className="card mt-4 overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Created</th><th>Customer</th><th>Estimate</th><th>Amount</th><th>Status</th><th>Opened</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="text-slate-500">No estimates yet.</td></tr>}
            {rows.map(({ q, name, email }) => (
              <tr key={q.id}>
                <td>{fmtDateTime(q.createdAt)}</td>
                <td>{name || email}</td>
                <td><Link className="font-semibold underline" href={`/admin/quotes/${q.id}`}>{q.title}</Link></td>
                <td>{money(q.totalCents)}</td>
                <td><Status value={q.status} /> {q.paymentStatus === "paid" && <Status value="paid" />}</td>
                <td>{q.viewedAt ? fmtDateTime(q.viewedAt) : q.status === "draft" ? "–" : "Not yet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
