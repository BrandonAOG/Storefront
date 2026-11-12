import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PlansAdmin() {
  await requireAdmin();
  const rows = await db().select().from(schema.plans).orderBy(asc(schema.plans.sortOrder), asc(schema.plans.name));
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Maintenance plans</h1>
        <Link href="/admin/plans/new" className="btn btn-primary">Add plan</Link>
      </div>
      <div className="card mt-4 overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Order</th><th>Name</th><th>Price</th><th>Shown</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="text-slate-500">No plans yet.</td></tr>}
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.sortOrder}</td>
                <td><Link className="font-semibold underline" href={`/admin/plans/${p.id}`}>{p.name}</Link></td>
                <td>{p.priceCents > 0 ? `${money(p.priceCents)} / ${p.interval}` : "Call for pricing"}</td>
                <td>{p.active ? "Yes" : "Hidden"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
