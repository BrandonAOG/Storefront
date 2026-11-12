import Link from "next/link";
import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function FeedbackAdmin() {
  await requireAdmin();
  const f = schema.feedback;
  const [rows, [t]] = await Promise.all([
    db().select({ f, name: schema.customers.name }).from(f).leftJoin(schema.customers, eq(schema.customers.id, f.customerId)).where(isNotNull(f.score)).orderBy(desc(f.answeredAt)).limit(200),
    db().select({
      asked: sql<number>`count(*)::int`,
      answered: sql<number>`count(${f.score})::int`,
      promoters: sql<number>`count(*) filter (where ${f.score} >= 9)::int`,
      detractors: sql<number>`count(*) filter (where ${f.score} <= 6)::int`,
    }).from(f),
  ]);
  const nps = t.answered ? Math.round(((t.promoters - t.detractors) / t.answered) * 100) : null;
  const stats: [string, string, string][] = [
    ["Net Promoter Score", nps === null ? "–" : String(nps), "promoters minus detractors, from −100 to 100"],
    ["Responses", `${t.answered} of ${t.asked}`, "customers asked"],
    ["Promoters / detractors", `${t.promoters} / ${t.detractors}`, "scores of 9–10 / 0–6"],
  ];
  return (
    <>
      <h1 className="text-2xl font-bold">Feedback</h1>
      <p className="mt-1 text-sm text-slate-500">Customers are asked after a job is marked completed. Scores of 9 or 10 are invited to leave a public review.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {stats.map(([label, value, sub]) => (
          <div key={label} className="card"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p><p className="text-sm text-slate-500">{sub}</p></div>
        ))}
      </div>
      <div className="card mt-4 overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>When</th><th>Customer</th><th>Score</th><th>Comment</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="text-slate-500">No responses yet.</td></tr>}
            {rows.map(({ f: r, name }) => (
              <tr key={r.id}>
                <td>{r.answeredAt && fmtDateTime(r.answeredAt)}</td>
                <td>{r.customerId ? <Link className="underline" href={`/admin/customers/${r.customerId}`}>{name || "Customer"}</Link> : "–"}</td>
                <td><span className={`badge ${r.score! >= 9 ? "bg-green-100 text-green-800" : r.score! <= 6 ? "bg-red-100 text-red-800" : "bg-slate-200 text-slate-700"}`}>{r.score}/10</span></td>
                <td className="whitespace-pre-line">{r.comment || "–"}</td>
                <td><Link className="underline" href={`/admin/orders/${r.orderId}`}>Booking</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
