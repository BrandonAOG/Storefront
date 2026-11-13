import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Status } from "@/components/admin";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function VisitsAdmin({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  await requireAdmin();
  const deleted = (await searchParams).deleted === "1";
  const v = schema.visits;
  const rows = await db()
    .select({ v, files: sql<number>`(select count(*)::int from visit_media m where m.visit_id = ${v.id})`, quotes: sql<number>`(select count(*)::int from quotes q where q.visit_id = ${v.id})` })
    .from(v)
    .orderBy(desc(v.createdAt))
    .limit(200);
  return (
    <>
      <h1 className="text-2xl font-bold">Virtual visits</h1>
      {deleted && <p role="status" className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">Request deleted.</p>}
      <p className="mt-1 text-sm text-slate-500">Open a request to schedule it, start the call, or delete it.</p>
      <div className="card mt-4 overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Requested</th><th>Customer</th><th>Topic</th><th>Type</th><th>Files</th><th>Estimates</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="text-slate-500">No requests yet.</td></tr>}
            {rows.map(({ v: r, files, quotes }) => (
              <tr key={r.id}>
                <td><Link className="font-semibold underline" href={`/admin/visits/${r.id}`}>{fmtDateTime(r.createdAt)}</Link></td>
                <td>{r.name}<br /><span className="text-slate-500">{r.phone}</span></td>
                <td>{r.topic || "–"}</td>
                <td>{r.mode === "async" ? "Video review" : "Live call"}</td>
                <td>{files}</td>
                <td>{quotes}</td>
                <td><Status value={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
