import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmtDay, fmtWindow, money } from "@/lib/format";
import { syncOrderPayment } from "@/lib/payments";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your booking", robots: { index: false } };

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) notFound();
  let [order] = await db().select().from(schema.orders).where(eq(schema.orders.token, token));
  if (!order) notFound();
  if (await syncOrderPayment(order).catch(() => false)) {
    [order] = await db().select().from(schema.orders).where(eq(schema.orders.token, token));
  }
  const [items, s] = await Promise.all([
    db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id)),
    getSettings(),
  ]);

  const heading =
    order.status === "pending" ? "Payment not completed" : order.status === "cancelled" ? "Booking cancelled" : order.status === "completed" ? "Service completed" : "You're booked!";
  const balance = order.subtotalCents - (order.paymentStatus === "paid" ? order.dueNowCents : 0);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="card">
        <p className={`badge ${order.status === "confirmed" || order.status === "completed" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>{order.status}</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{heading}</h1>
        {order.status === "pending" && (
          <p className="mt-2 text-slate-600">We haven&apos;t received payment for this booking, so the time is only held briefly. If you were charged, refresh this page in a moment. Otherwise you can <Link href="/book" className="underline">start again</Link>.</p>
        )}
        {order.status === "confirmed" && <p className="mt-2 text-slate-600">Thanks, {order.name.split(" ")[0]}. Save this page for your records.</p>}

        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="font-semibold text-slate-500">When</dt><dd>{fmtDay(order.day, true)}<br />Arrival {fmtWindow(order.startMin, order.endMin)}</dd></div>
          <div><dt className="font-semibold text-slate-500">Where</dt><dd>{order.address}<br />{order.city} {order.zip}</dd></div>
        </dl>

        <ul className="mt-6 divide-y divide-slate-100 border-y border-slate-200 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between py-2"><span>{i.qty} × {i.name}</span><span className="shrink-0 font-semibold">{i.priceCents > 0 ? money(i.priceCents * i.qty) : "Quoted on site"}</span></li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 text-sm">
          {order.subtotalCents > 0 && <p className="flex justify-between font-bold"><span>{items.some((i) => i.priceCents === 0) ? "Listed prices" : "Total"}</span><span>{money(order.subtotalCents)}</span></p>}
          {items.some((i) => i.priceCents === 0) && <p className="text-slate-600">We&apos;ll confirm the price with you before any work begins.</p>}
          {order.paymentStatus === "paid" && <p className="flex justify-between text-green-700"><span>Paid online</span><span>{money(order.dueNowCents)}</span></p>}
          {order.status !== "cancelled" && balance > 0 && <p className="flex justify-between text-slate-600"><span>Due at service</span><span>{money(balance)}</span></p>}
        </div>

        {(s.phone || s.email) && (
          <p className="mt-6 text-sm text-slate-600">
            Need to change something? Contact us{s.phone && <> at <a className="underline" href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>{s.phone}</a></>}{s.phone && s.email && " or"}{s.email && <> <a className="underline" href={`mailto:${s.email}`}>{s.email}</a></>}.
          </p>
        )}
      </div>
    </div>
  );
}
