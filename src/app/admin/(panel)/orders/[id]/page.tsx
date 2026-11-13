import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Saved, Select, Status } from "@/components/admin";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, fmtDay, fmtWindow, money } from "@/lib/format";
import { deleteOrder, updateOrder } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [o] = await db().select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!o) notFound();
  const sp = await searchParams;
  const error = sp.error;
  const items = await db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id));
  return (
    <>
      <Link href="/admin/orders" className="text-sm text-slate-500 hover:underline">← Bookings</Link>
      <h1 className="mt-2 text-2xl font-bold">{o.name} <Status value={o.status} /> <Status value={o.paymentStatus} /></h1>
      <p className="text-sm text-slate-500">Booked {fmtDateTime(o.createdAt)}</p>
      <div className="mt-4"><Saved show={sp.saved === "1"} /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card text-sm">
          <h2 className="font-bold">Job</h2>
          <p className="mt-2">{fmtDay(o.day, true)}<br />Arrival {fmtWindow(o.startMin, o.endMin)}</p>
          <p className="mt-2">{o.address}<br />{o.city} {o.zip}</p>
          <p className="mt-2"><a className="underline" href={`tel:${o.phone.replace(/[^\d+]/g, "")}`}>{o.phone}</a><br /><a className="underline" href={`mailto:${o.email}`}>{o.email}</a></p>
          {o.notes && <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-100 p-3">{o.notes}</p>}
          <p className="mt-2 text-slate-500">Came from: {o.source}{o.campaign && ` / ${o.campaign}`}</p>
          <p className="mt-3"><Link className="underline" href={`/order/${o.token}`}>Customer confirmation page ↗</Link>{o.customerId && <> · <Link className="underline" href={`/admin/customers/${o.customerId}`}>Customer history</Link></>}</p>
        </div>
        <div className="card text-sm">
          <h2 className="font-bold">Items</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {items.map((i) => <li key={i.id} className="flex justify-between py-2"><span>{i.qty} × {i.name}</span><span>{money(i.priceCents * i.qty)}</span></li>)}
          </ul>
          <p className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-bold"><span>Total</span><span>{money(o.subtotalCents)}</span></p>
          <p className="flex justify-between text-slate-600"><span>Charged online at checkout</span><span>{money(o.dueNowCents)}</span></p>
          <form action={updateOrder} className="mt-5 grid grid-cols-2 gap-3">
            <input type="hidden" name="id" value={o.id} />
            <label><span className="label">Status</span><Select name="status" value={o.status} options={["pending", "confirmed", "completed", "cancelled"]} /></label>
            <label><span className="label">Payment</span><Select name="paymentStatus" value={o.paymentStatus} options={["unpaid", "paid", "refunded"]} /></label>
            <button className="btn btn-dark col-span-2">Save</button>
          </form>
          <p className="mt-2 text-xs text-slate-500">Marking a job completed starts the feedback request. Refunds are issued from your Stripe dashboard.</p>
        </div>
      </div>

      <form action={deleteOrder} className="card mt-6 border-red-200">
        <input type="hidden" name="id" value={o.id} />
        <h2 className="font-bold text-red-800">Delete this booking</h2>
        <p className="mt-1 text-sm text-slate-600">Removes the booking and frees its arrival window. To keep a record but stop the job, set the status to cancelled instead.</p>
        {error === "confirm" && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">Tick the box to confirm.</p>}
        <label className="mt-3 flex items-start gap-3 text-sm"><input type="checkbox" name="confirm" required /> <span>I understand this is permanent and can&apos;t be undone.</span></label>
        <button className="btn btn-danger mt-3">Delete permanently</button>
      </form>
    </>
  );
}
