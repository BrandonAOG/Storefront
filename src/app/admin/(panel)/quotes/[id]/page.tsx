import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Saved, Status } from "@/components/admin";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, money } from "@/lib/format";
import { emailEnabled } from "@/lib/messaging";
import { appUrl } from "@/lib/stripe";
import { saveQuote, setQuoteStatus } from "../../../actions";

export const dynamic = "force-dynamic";
const ROWS = 10;
const ERRORS: Record<string, string> = {
  customer: "Enter the customer's name and a valid email address.",
  items: "Add at least one item that isn't optional before sending.",
  locked: "This estimate was accepted and can no longer be changed.",
};

export default async function QuoteEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; sent?: string; error?: string; visit?: string; customer?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "new";
  const uuid = /^[0-9a-f-]{36}$/;
  const q = isNew || !uuid.test(id) ? null : (await db().select().from(schema.quotes).where(eq(schema.quotes.id, id)))[0];
  if (!isNew && !q) notFound();

  // Prefill from a virtual visit or an existing customer.
  const visit = isNew && sp.visit && uuid.test(sp.visit) ? (await db().select().from(schema.visits).where(eq(schema.visits.id, sp.visit)))[0] : undefined;
  const customerId = q?.customerId ?? (isNew && sp.customer && uuid.test(sp.customer) ? sp.customer : undefined);
  const customer = customerId ? (await db().select().from(schema.customers).where(eq(schema.customers.id, customerId)))[0] : undefined;
  const items = q ? await db().select().from(schema.quoteItems).where(eq(schema.quoteItems.quoteId, q.id)).orderBy(asc(schema.quoteItems.id)) : [];
  const locked = q?.status === "accepted";
  const link = q ? `${appUrl()}/quote/${q.token}` : "";

  return (
    <>
      <Link href="/admin/quotes" className="text-sm text-slate-500 hover:underline">← Estimates</Link>
      <h1 className="mt-2 text-2xl font-bold">{q ? q.title : "New estimate"} {q && <Status value={q.status} />} {q?.paymentStatus === "paid" && <Status value="paid" />}</h1>
      <div className="mt-4">
        <Saved show={sp.saved === "1"} />
        {sp.sent === "1" && <p role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">Marked as sent.{emailEnabled() ? " The customer has been emailed the link." : " Email isn't connected, so copy the link below and send it to the customer yourself."}</p>}
        {sp.error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{ERRORS[sp.error] ?? "Something went wrong."}</p>}
      </div>

      {q && q.status !== "draft" && (
        <div className="card mb-4 text-sm">
          <p className="font-semibold">Customer link</p>
          <p className="mt-1 break-all"><a className="underline" href={link} target="_blank" rel="noopener noreferrer">{link}</a></p>
          <p className="mt-2 text-slate-500">
            {q.sentAt && `Sent ${fmtDateTime(q.sentAt)}. `}{q.viewedAt ? `Opened ${fmtDateTime(q.viewedAt)}. ` : "Not opened yet. "}
            {q.acceptedAt && `Accepted ${fmtDateTime(q.acceptedAt)} for ${money(q.totalCents)}${q.paymentStatus === "paid" ? `, ${money(q.dueNowCents)} paid online` : ""}.`}
          </p>
        </div>
      )}

      <form action={saveQuote} className="card grid gap-4 sm:grid-cols-2">
        {q && <input type="hidden" name="id" value={q.id} />}
        {visit && <input type="hidden" name="visitId" value={visit.id} />}
        <fieldset disabled={locked} className="contents">
          {q ? (
            <p className="text-sm sm:col-span-2">For <Link className="font-semibold underline" href={`/admin/customers/${q.customerId}`}>{customer?.name || customer?.email}</Link> · {customer?.email}</p>
          ) : (
            <>
              <label><span className="label">Customer name</span><input className="input" name="custName" required maxLength={120} defaultValue={customer?.name ?? visit?.name} /></label>
              <label><span className="label">Customer email</span><input className="input" name="custEmail" type="email" required maxLength={200} defaultValue={customer?.email ?? visit?.email} /></label>
              <label><span className="label">Customer phone</span><input className="input" name="custPhone" maxLength={30} defaultValue={customer?.phone ?? visit?.phone} /></label>
              <span />
            </>
          )}
          <label className="sm:col-span-2"><span className="label">Title</span><input className="input" name="title" maxLength={160} defaultValue={q?.title ?? (visit?.topic ? `${visit.topic} estimate` : "Your estimate")} /></label>
          <label className="sm:col-span-2"><span className="label">Personal message to the customer</span><textarea className="input" name="message" rows={4} maxLength={3000} defaultValue={q?.message} placeholder="What you saw on the visit, what you recommend and why." /></label>

          <div className="sm:col-span-2">
            <p className="label">Items</p>
            <div className="space-y-2">
              {Array.from({ length: ROWS }, (_, i) => {
                const it = items[i];
                return (
                  <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[2fr_3fr_110px_70px_auto]">
                    <input className="input" name={`name-${i}`} maxLength={160} placeholder="Item" aria-label={`Item ${i + 1} name`} defaultValue={it?.name} />
                    <input className="input" name={`desc-${i}`} maxLength={1000} placeholder="Description (optional)" aria-label={`Item ${i + 1} description`} defaultValue={it?.description} />
                    <input className="input" name={`price-${i}`} inputMode="decimal" placeholder="Price $" aria-label={`Item ${i + 1} price`} defaultValue={it ? (it.priceCents / 100).toFixed(2) : ""} />
                    <input className="input" name={`qty-${i}`} type="number" min={1} max={999} aria-label={`Item ${i + 1} quantity`} defaultValue={it?.qty ?? 1} />
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" name={`optional-${i}`} defaultChecked={it?.optional ?? false} /> Optional</label>
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-slate-500">Rows without a name are ignored. Optional items appear as add-ons the customer can tick.</p>
          </div>

          <label>
            <span className="label">Deposit charged on acceptance (%)</span>
            <input className="input" name="depositPercent" type="number" min={0} max={100} defaultValue={q?.depositPercent ?? 0} />
            <span className="mt-1 block text-xs text-slate-500">0 = accept without paying online. Needs Stripe connected.</span>
          </label>
          <label><span className="label">Valid until (optional)</span><input className="input" name="expiresDay" type="date" defaultValue={q?.expiresDay ?? ""} /></label>
          {!locked && (
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <button className="btn btn-ghost" name="intent" value="save">Save draft changes</button>
              <button className="btn btn-primary" name="intent" value="send">{q?.status === "sent" ? "Save and re-send to customer" : "Save and send to customer"}</button>
            </div>
          )}
        </fieldset>
      </form>

      {q && !locked && q.status !== "draft" && (
        <form action={setQuoteStatus} className="mt-4 flex gap-3">
          <input type="hidden" name="id" value={q.id} />
          {q.status !== "declined" && <button className="btn btn-danger" name="status" value="declined">Mark as declined</button>}
          <button className="btn btn-ghost" name="status" value="draft">Pull back to draft</button>
        </form>
      )}
    </>
  );
}
