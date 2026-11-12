import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Saved, Status } from "@/components/admin";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, fmtDay, money } from "@/lib/format";
import { saveCustomer } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function CustomerDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [c] = await db().select().from(schema.customers).where(eq(schema.customers.id, id));
  if (!c) notFound();
  const [orders, quotes, visits, memberships, messages, feedback] = await Promise.all([
    db().select().from(schema.orders).where(eq(schema.orders.customerId, id)).orderBy(desc(schema.orders.createdAt)),
    db().select().from(schema.quotes).where(eq(schema.quotes.customerId, id)).orderBy(desc(schema.quotes.createdAt)),
    db().select().from(schema.visits).where(eq(schema.visits.customerId, id)).orderBy(desc(schema.visits.createdAt)),
    db().select().from(schema.memberships).where(eq(schema.memberships.customerId, id)).orderBy(desc(schema.memberships.createdAt)),
    db().select().from(schema.messages).where(eq(schema.messages.customerId, id)).orderBy(desc(schema.messages.createdAt)).limit(50),
    db().select().from(schema.feedback).where(eq(schema.feedback.customerId, id)),
  ]);

  // One timeline, newest first.
  type Entry = { at: Date; node: React.ReactNode; key: string };
  const timeline: Entry[] = [
    ...orders.map((o) => ({ at: o.createdAt, key: `o${o.id}`, node: <><Link className="font-semibold underline" href={`/admin/orders/${o.id}`}>Booking</Link> for {fmtDay(o.day)} · {money(o.subtotalCents)} <Status value={o.status} /> <Status value={o.paymentStatus} /></> })),
    ...quotes.map((q) => ({ at: q.createdAt, key: `q${q.id}`, node: <><Link className="font-semibold underline" href={`/admin/quotes/${q.id}`}>Estimate</Link> “{q.title}” · {money(q.totalCents)} <Status value={q.status} /></> })),
    ...visits.map((v) => ({ at: v.createdAt, key: `v${v.id}`, node: <><Link className="font-semibold underline" href={`/admin/visits/${v.id}`}>Virtual visit</Link>{v.topic && ` · ${v.topic}`} <Status value={v.status} /></> })),
    ...memberships.map((m) => ({ at: m.createdAt, key: `m${m.id}`, node: <><span className="font-semibold">Plan</span> {m.planName} · {money(m.priceCents)} / {m.interval} <Status value={m.status} /></> })),
    ...feedback.filter((f) => f.answeredAt).map((f) => ({ at: f.answeredAt!, key: `f${f.id}`, node: <><span className="font-semibold">Feedback</span> {f.score}/10{f.comment && ` · “${f.comment}”`}</> })),
    ...messages.map((m) => ({ at: m.createdAt, key: `g${m.id}`, node: <><span className="font-semibold">{m.channel === "sms" ? "Text" : "Email"}</span> {m.subject || m.automationKey} <Status value={m.status} /></> })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <>
      <Link href="/admin/customers" className="text-sm text-slate-500 hover:underline">← Customers</Link>
      <h1 className="mt-2 text-2xl font-bold">{c.name || c.email}</h1>
      <div className="mt-4"><Saved show={(await searchParams).saved === "1"} /></div>
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="card h-fit text-sm">
          <p><a className="underline" href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a><br /><a className="underline" href={`mailto:${c.email}`}>{c.email}</a></p>
          {c.address && <p className="mt-2">{c.address}<br />{c.city} {c.zip}</p>}
          <p className="mt-2 text-slate-500">First seen {fmtDateTime(c.createdAt)}<br />Came from: {c.source}{c.medium && ` / ${c.medium}`}{c.campaign && ` / ${c.campaign}`}</p>
          <form action={saveCustomer} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
            <input type="hidden" name="id" value={c.id} />
            <label className="block"><span className="label">Internal notes</span><textarea className="input" name="notes" rows={4} maxLength={3000} defaultValue={c.notes} /></label>
            <label className="flex items-center gap-2"><input type="checkbox" name="smsConsent" defaultChecked={c.smsConsent} /> Agreed to receive texts</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="emailOptOut" defaultChecked={c.emailOptOut} /> Unsubscribed from reminders and offers</label>
            <button className="btn btn-dark">Save</button>
          </form>
          <p className="mt-3"><Link className="underline" href={`/admin/quotes/new?customer=${c.id}`}>Create an estimate for this customer →</Link></p>
        </div>
        <div className="card">
          <h2 className="font-bold">History</h2>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {timeline.length === 0 && <li className="py-2 text-slate-500">Nothing yet.</li>}
            {timeline.map((e) => (
              <li key={e.key} className="flex flex-wrap justify-between gap-2 py-2"><span>{e.node}</span><span className="text-slate-500">{fmtDateTime(e.at)}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
