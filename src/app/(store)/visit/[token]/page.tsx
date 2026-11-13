import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { MediaUploader } from "@/components/MediaUploader";
import { callChecklist } from "@/lib/checklist";
import { fmtAppointment } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your virtual visit", robots: { index: false } };

export default async function VisitStatus({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) notFound();
  const [v] = await db().select().from(schema.visits).where(eq(schema.visits.token, token));
  if (!v) notFound();
  const [media, s] = await Promise.all([
    db().select().from(schema.visitMedia).where(eq(schema.visitMedia.visitId, v.id)).orderBy(asc(schema.visitMedia.createdAt)),
    getSettings(),
  ]);
  const uploads = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const open = v.status === "new" || v.status === "scheduled";
  const list = callChecklist(s);
  const surveys = media.filter((m) => m.kind === "survey");
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="card">
        <h1 className="text-3xl font-bold tracking-tight">{v.status === "done" || v.status === "closed" ? "Virtual visit complete" : "Request received"}</h1>
        <p className="mt-2 text-slate-600">
          {v.mode === "async"
            ? `Thanks, ${v.name.split(" ")[0]}. Add a short video or a few photos below and we'll review them and send your estimate.`
            : `Thanks, ${v.name.split(" ")[0]}. We'll contact you to confirm a time. Save this page: you'll join your video call from here.`}
        </p>
        {open && v.scheduledAt && (
          <p className="mt-4 rounded-xl bg-cream p-4 font-display font-bold">Your video call is {fmtAppointment(v.scheduledAt)} (Eastern time).</p>
        )}
        {open && (
          <div className="mt-4 rounded-xl border border-slate-200 p-4 text-sm">
            <h2 className="font-display text-base font-bold">Before your call</h2>
            {list.needed.length > 0 && (
              <>
                <p className="mt-2 font-semibold">Please have ready:</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">{list.needed.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            )}
            {list.recommended.length > 0 && (
              <>
                <p className="mt-3 font-semibold">Helpful if you have them <span className="font-normal text-slate-500">(not required)</span>:</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">{list.recommended.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            )}
            <div className="mt-4 border-t border-slate-200 pt-4 first:mt-0 first:border-0 first:pt-0">
              <p className="font-semibold">Have a printer? Print our measuring sheets.</p>
              <p className="mt-1 text-slate-600">Three pages you tape up near your panel, your meter and the generator spot. They let us measure accurately from the video, which often saves a separate site visit.</p>
              <a href="/measuring-sheets" target="_blank" rel="noopener noreferrer" className="btn btn-dark mt-3">Get the measuring sheets</a>
            </div>
            {uploads && (
              <div className="mt-4 border-t border-slate-200 pt-4 first:mt-0 first:border-0 first:pt-0">
                <p className="font-semibold">Have a property survey or site plan?</p>
                <p className="mt-1 text-slate-600">Add it now and we&apos;ll look it over before the call. It shows your property lines and where the house sits, which decides where a generator can go.</p>
                {surveys.length > 0 && (
                  <ul className="mt-2 space-y-1">{surveys.map((m) => <li key={m.id} className="flex gap-2"><span className="text-green-600" aria-hidden>✓</span>{m.name || "Survey"} received</li>)}</ul>
                )}
                <div className="mt-3"><MediaUploader token={token} remaining={10 - media.length} survey /></div>
              </div>
            )}
          </div>
        )}
        {open && (
          <div className="mt-5">
            <a href={`/call/${token}`} className="btn btn-primary w-full py-3 text-base sm:w-auto">Join video call</a>
            <p className="mt-2 text-sm text-slate-600">Use this at your appointment time. It opens your camera so you can show us your site. Nothing to install.</p>
          </div>
        )}
        {/^https:\/\//i.test(v.meetingUrl) && open && (
          <a href={v.meetingUrl} target="_blank" rel="noopener noreferrer" className="btn btn-dark mt-5">Join your virtual visit ↗</a>
        )}
        {uploads && (
          <div className="mt-8 border-t border-slate-200 pt-6">
            <h2 className="text-lg font-bold">Photos and video of your site</h2>
            <p className="mt-1 text-sm text-slate-600">Most helpful: your electrical panel with the cover open, your gas or propane meter, and where you&apos;d like the generator to sit.</p>
            {media.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm">
                {media.map((m) => <li key={m.id} className="flex gap-2"><span className="text-green-600" aria-hidden>✓</span>{m.name || "File"} <span className="text-slate-500">({Math.max(1, Math.round(m.size / 1024 / 1024))} MB)</span></li>)}
              </ul>
            )}
            {open && <div className="mt-4"><MediaUploader token={token} remaining={10 - media.length} /></div>}
          </div>
        )}
        {s.phone && <p className="mt-6 text-sm text-slate-600">Questions? Call <a className="underline" href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>{s.phone}</a>.</p>}
      </div>
    </div>
  );
}
