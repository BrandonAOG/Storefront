import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { Select, Status } from "@/components/admin";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, fmtDay } from "@/lib/format";
import { updateVisit } from "../../actions";

export const dynamic = "force-dynamic";

export default async function VisitsAdmin() {
  await requireAdmin();
  const rows = await db().select().from(schema.visits).orderBy(desc(schema.visits.createdAt)).limit(200);
  return (
    <>
      <h1 className="text-2xl font-bold">Virtual visits</h1>
      {rows.length === 0 && <p className="mt-4 text-slate-500">No requests yet.</p>}
      <div className="mt-4 space-y-4">
        {rows.map((v) => (
          <div key={v.id} className="card grid gap-4 text-sm md:grid-cols-2">
            <div>
              <p className="text-base font-bold">{v.name} <Status value={v.status} /></p>
              <p className="text-slate-500">Requested {fmtDateTime(v.createdAt)}</p>
              <p className="mt-2"><a className="underline" href={`tel:${v.phone.replace(/[^\d+]/g, "")}`}>{v.phone}</a> · <a className="underline" href={`mailto:${v.email}`}>{v.email}</a></p>
              {(v.address || v.zip) && <p>{v.address} {v.zip}</p>}
              {v.topic && <p className="mt-2"><strong>Topic:</strong> {v.topic}</p>}
              {(v.preferredDay || v.preferredTime) && <p><strong>Prefers:</strong> {v.preferredDay && fmtDay(v.preferredDay, true)} {v.preferredTime}</p>}
              {v.details && <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-100 p-3">{v.details}</p>}
            </div>
            <form action={updateVisit} className="space-y-3">
              <input type="hidden" name="id" value={v.id} />
              <label className="block"><span className="label">Status</span><Select name="status" value={v.status} options={["new", "scheduled", "done", "closed"]} /></label>
              <label className="block"><span className="label">Meeting link (https://…)</span><input className="input" name="meetingUrl" type="url" maxLength={500} defaultValue={v.meetingUrl} placeholder="Zoom, Google Meet or Teams link" /></label>
              <label className="block"><span className="label">Internal notes</span><textarea className="input" name="adminNotes" rows={3} maxLength={2000} defaultValue={v.adminNotes} /></label>
              <div className="flex items-center gap-3">
                <button className="btn btn-dark">Save</button>
                {v.meetingUrl && <a className="underline" href={v.meetingUrl} target="_blank" rel="noopener noreferrer">Open meeting ↗</a>}
              </div>
            </form>
          </div>
        ))}
      </div>
    </>
  );
}
