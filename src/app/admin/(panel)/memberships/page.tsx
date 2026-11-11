import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { Select, Status } from "@/components/admin";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, money } from "@/lib/format";
import { updateMembership } from "../../actions";

export const dynamic = "force-dynamic";

export default async function MembershipsAdmin() {
  await requireAdmin();
  const rows = await db().select().from(schema.memberships).orderBy(desc(schema.memberships.createdAt)).limit(300);
  return (
    <>
      <h1 className="text-2xl font-bold">Memberships</h1>
      <p className="mt-1 text-sm text-slate-500">Status follows Stripe automatically when online payment is on. To stop billing, cancel the subscription in Stripe.</p>
      <div className="card mt-4 overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Signed up</th><th>Customer</th><th>Plan</th><th>Generator</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="text-slate-500">No memberships yet.</td></tr>}
            {rows.map((m) => (
              <tr key={m.id}>
                <td>{fmtDateTime(m.createdAt)}</td>
                <td>{m.name}<br /><span className="text-slate-500">{m.phone} · {m.email}</span><br /><span className="text-slate-500">{m.address}, {m.city} {m.zip}</span></td>
                <td>{m.planName}<br />{money(m.priceCents)} / {m.interval}</td>
                <td>{m.generator || "–"}</td>
                <td><Status value={m.status} /></td>
                <td>
                  <form action={updateMembership} className="flex gap-2">
                    <input type="hidden" name="id" value={m.id} />
                    <Select name="status" value={m.status} options={["pending", "active", "cancelled"]} />
                    <button className="btn btn-ghost">Set</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
