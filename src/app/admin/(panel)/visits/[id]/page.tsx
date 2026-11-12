import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Saved, Select, Status } from "@/components/admin";
import { VisitReview } from "@/components/VisitReview";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, fmtDay, money } from "@/lib/format";
import { appUrl } from "@/lib/stripe";
import { addVisitNote, deleteVisitNote, updateVisit } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function VisitDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [v] = await db().select().from(schema.visits).where(eq(schema.visits.id, id));
  if (!v) notFound();
  const [media, notes, quotes] = await Promise.all([
    db().select().from(schema.visitMedia).where(eq(schema.visitMedia.visitId, id)).orderBy(asc(schema.visitMedia.createdAt)),
    db().select().from(schema.visitNotes).where(eq(schema.visitNotes.visitId, id)).orderBy(asc(schema.visitNotes.createdAt)),
    db().select().from(schema.quotes).where(eq(schema.quotes.visitId, id)).orderBy(desc(schema.quotes.createdAt)),
  ]);
  return (
    <>
      <Link href="/admin/visits" className="text-sm text-slate-500 hover:underline">← Virtual visits</Link>
      <h1 className="mt-2 text-2xl font-bold">{v.name} <Status value={v.status} /></h1>
      <p className="text-sm text-slate-500">{v.mode === "async" ? "Video review" : "Live call"} requested {fmtDateTime(v.createdAt)} · came from {v.source}</p>
      <div className="mt-4"><Saved show={(await searchParams).saved === "1"} /></div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card text-sm">
          <p><a className="underline" href={`tel:${v.phone.replace(/[^\d+]/g, "")}`}>{v.phone}</a> · <a className="underline" href={`mailto:${v.email}`}>{v.email}</a></p>
          {(v.address || v.zip) && <p>{v.address} {v.zip}</p>}
          {v.topic && <p className="mt-2"><strong>Topic:</strong> {v.topic}</p>}
          {(v.preferredDay || v.preferredTime) && <p><strong>Prefers:</strong> {v.preferredDay && fmtDay(v.preferredDay, true)} {v.preferredTime}</p>}
          {v.details && <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-100 p-3">{v.details}</p>}
          {v.customerId && <p className="mt-3"><Link className="underline" href={`/admin/customers/${v.customerId}`}>Customer history →</Link></p>}
          {v.token && <p className="mt-1 break-all text-slate-500">Customer&apos;s page: <a className="underline" href={`${appUrl()}/visit/${v.token}`} target="_blank" rel="noopener noreferrer">{appUrl()}/visit/{v.token.slice(0, 8)}…</a></p>}
        </div>
        <form action={updateVisit} className="card space-y-3 text-sm">
          <input type="hidden" name="id" value={v.id} />
          <label className="block"><span className="label">Status</span><Select name="status" value={v.status} options={["new", "scheduled", "done", "closed"]} /></label>
          <label className="block"><span className="label">Meeting link (https://…)</span><input className="input" name="meetingUrl" type="url" maxLength={500} defaultValue={v.meetingUrl} placeholder="Zoom, Google Meet or Teams link" /><span className="mt-1 block text-xs text-slate-500">Shown on the customer&apos;s page as a “Join” button.</span></label>
          <label className="block"><span className="label">Internal notes</span><textarea className="input" name="adminNotes" rows={3} maxLength={2000} defaultValue={v.adminNotes} /></label>
          <div className="flex items-center gap-3">
            <button className="btn btn-dark">Save</button>
            {v.meetingUrl && <a className="underline" href={v.meetingUrl} target="_blank" rel="noopener noreferrer">Open meeting ↗</a>}
          </div>
        </form>
      </div>

      <div className="card mt-4">
        <h2 className="mb-3 font-bold">Photos and video from the customer</h2>
        <VisitReview
          visitId={v.id}
          media={media.map((m) => ({ id: m.id, url: m.url, name: m.name, contentType: m.contentType }))}
          notes={notes.map((n) => ({ id: n.id, mediaId: n.mediaId, atSeconds: n.atSeconds, body: n.body }))}
          addNote={addVisitNote}
          deleteNote={deleteVisitNote}
        />
      </div>

      <div className="card mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">Estimates from this visit</h2>
          <Link href={`/admin/quotes/new?visit=${v.id}`} className="btn btn-primary">Turn into an estimate</Link>
        </div>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {quotes.length === 0 && <li className="py-2 text-slate-500">None yet.</li>}
          {quotes.map((q) => <li key={q.id} className="flex justify-between py-2"><Link className="underline" href={`/admin/quotes/${q.id}`}>{q.title}</Link><span>{money(q.totalCents)} <Status value={q.status} /></span></li>)}
        </ul>
      </div>
    </>
  );
}
