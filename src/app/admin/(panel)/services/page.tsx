import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ServicesAdmin() {
  await requireAdmin();
  const rows = await db().select().from(schema.services).orderBy(asc(schema.services.sortOrder), asc(schema.services.name));
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Services</h1>
        <Link href="/admin/services/new" className="btn btn-primary">Add service</Link>
      </div>
      <div className="card mt-4 overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Order</th><th>Name</th><th>Category</th><th>Price</th><th>Shown</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="text-slate-500">No services yet.</td></tr>}
            {rows.map((s) => (
              <tr key={s.id}>
                <td>{s.sortOrder}</td>
                <td><Link className="font-semibold underline" href={`/admin/services/${s.id}`}>{s.name}</Link></td>
                <td>{s.category}</td>
                <td>{s.priceType !== "fixed" ? "Free estimate" : s.priceCents > 0 ? money(s.priceCents) : "No price set"}</td>
                <td>{s.active ? "Yes" : "Hidden"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
