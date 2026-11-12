import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { QuoteAccept } from "@/components/QuoteAccept";
import { fmtDay, money } from "@/lib/format";
import { syncQuotePayment } from "@/lib/payments";
import { getSettings } from "@/lib/settings";
import { todayLocal } from "@/lib/slots";
import { stripeEnabled } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your estimate", robots: { index: false } };

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) notFound();
  let [q] = await db().select().from(schema.quotes).where(eq(schema.quotes.token, token));
  // Drafts are not visible to customers.
  if (!q || q.status === "draft") notFound();
  if (await syncQuotePayment(q).catch(() => false)) {
    [q] = await db().select().from(schema.quotes).where(eq(schema.quotes.token, token));
  }
  // First open is recorded so you can see which estimates have been read.
  await db().update(schema.quotes).set({ viewedAt: new Date() }).where(and(eq(schema.quotes.id, q.id), isNull(schema.quotes.viewedAt)));

  const [items, s, [customer]] = await Promise.all([
    db().select().from(schema.quoteItems).where(eq(schema.quoteItems.quoteId, q.id)).orderBy(asc(schema.quoteItems.id)),
    getSettings(),
    db().select().from(schema.customers).where(eq(schema.customers.id, q.customerId)),
  ]);
  const expired = q.status === "expired" || (q.status === "sent" && q.expiresDay !== null && q.expiresDay < todayLocal());
  const canAccept = q.status === "sent" && !expired;
  const accepted = q.status === "accepted";
  const shown = accepted ? items.filter((i) => !i.optional || i.selected) : items;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="card">
        <p className="text-sm text-slate-500">Estimate from {s.businessName}{customer ? ` for ${customer.name}` : ""}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{q.title}</h1>
        {accepted && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">Accepted{q.paymentStatus === "paid" ? ` – ${money(q.dueNowCents)} paid` : ""}. Thank you! We&apos;ll contact you to schedule the work.</p>}
        {q.status === "declined" && <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">This estimate was closed. Call us if you&apos;d like to revisit it.</p>}
        {expired && <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">This estimate has expired. Call us for an updated one.</p>}
        {q.message && <p className="mt-4 whitespace-pre-line text-slate-700">{q.message}</p>}
        <div className="mt-6">
          <QuoteAccept
            token={token}
            items={shown.map((i) => ({ id: i.id, name: i.name, description: i.description, priceCents: i.priceCents, qty: i.qty, optional: accepted ? false : i.optional }))}
            depositPercent={q.depositPercent}
            payOnline={stripeEnabled() && q.depositPercent > 0}
            canAccept={canAccept}
          />
        </div>
        {canAccept && q.expiresDay && <p className="mt-3 text-center text-xs text-slate-500">Valid until {fmtDay(q.expiresDay, true)}</p>}
        {s.phone && <p className="mt-6 text-sm text-slate-600">Questions? Call <a className="underline" href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>{s.phone}</a>.</p>}
      </div>
    </div>
  );
}
