import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { Status } from "@/components/admin";
import { requireAdmin } from "@/lib/auth";
import { loadAutomations } from "@/lib/automations";
import { fmtDateTime } from "@/lib/format";
import { emailEnabled, smsEnabled } from "@/lib/messaging";
import { resetAutomation, runJobsNow, saveAutomation } from "../../actions";

export const dynamic = "force-dynamic";

export default async function MessagesAdmin({ searchParams }: { searchParams: Promise<{ saved?: string; ran?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [autos, log] = await Promise.all([loadAutomations(), db().select().from(schema.messages).orderBy(desc(schema.messages.createdAt)).limit(100)]);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Messages</h1>
        <form action={runJobsNow}><button className="btn btn-ghost">Run today&apos;s reminders now</button></form>
      </div>
      <p className="mt-1 text-sm text-slate-500">Reminders, review requests and follow-ups go out once a day automatically. Confirmations go out immediately.</p>
      {sp.ran && <p role="status" className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">Ran: {sp.ran}</p>}
      {(!emailEnabled() || !smsEnabled()) && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {!emailEnabled() && "Email isn't connected, so emails are recorded below but not sent. "}
          {!smsEnabled() && "Texting isn't connected, so texts are recorded but not sent. "}
          See Integrations for what to set up.
        </p>
      )}

      <h2 className="mt-8 text-lg font-bold">Message templates</h2>
      <p className="text-sm text-slate-500">You can use {"{{name}}"}, {"{{business}}"}, {"{{phone}}"} and {"{{link}}"} in any message. Booking messages also have {"{{day}}"}, {"{{window}}"}, {"{{address}}"}, {"{{items}}"} and {"{{total}}"}.</p>
      <div className="mt-3 space-y-3">
        {[...autos.values()].map((a) => (
          <details key={a.key} id={a.key} className="card" open={sp.saved === a.key}>
            <summary className="cursor-pointer font-semibold">
              {a.label} <span className={`badge ${a.enabled ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"}`}>{a.enabled ? "on" : "off"}</span>
              <span className="ml-2 text-sm font-normal text-slate-500">{a.when}{a.marketing && " · stops if the customer unsubscribes"}</span>
            </summary>
            {sp.saved === a.key && <p role="status" className="mt-3 text-sm text-green-700">Saved.</p>}
            <form action={saveAutomation} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="key" value={a.key} />
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="enabled" defaultChecked={a.enabled} /> Send this message</label>
              {a.delayLabel ? <label><span className="label">{a.delayLabel}</span><input className="input" type="number" name="delayDays" min={0} max={3650} defaultValue={a.delayDays} /></label> : <input type="hidden" name="delayDays" value={a.delayDays} />}
              <label className="sm:col-span-2"><span className="label">Email subject</span><input className="input" name="subject" maxLength={200} defaultValue={a.subject} /></label>
              <label className="sm:col-span-2"><span className="label">Email text</span><textarea className="input font-mono" name="body" rows={8} maxLength={5000} defaultValue={a.body} /></label>
              <label className="sm:col-span-2"><span className="label">Text message (leave empty to send no text)</span><textarea className="input" name="sms" rows={2} maxLength={320} defaultValue={a.sms} /><span className="mt-1 block text-xs text-slate-500">Only sent to customers who ticked “text me updates”.</span></label>
              <div className="flex gap-3 sm:col-span-2">
                <button className="btn btn-dark">Save</button>
                <button className="btn btn-ghost" formAction={resetAutomation}>Reset to default</button>
              </div>
            </form>
          </details>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-bold">Recent messages</h2>
      <div className="card mt-3 overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>When</th><th>To</th><th>Message</th><th>Status</th></tr></thead>
          <tbody>
            {log.length === 0 && <tr><td colSpan={4} className="text-slate-500">Nothing sent yet.</td></tr>}
            {log.map((m) => (
              <tr key={m.id}>
                <td>{fmtDateTime(m.createdAt)}</td>
                <td>{m.channel === "sms" ? "Text" : "Email"}<br /><span className="text-slate-500">{m.toAddr}</span></td>
                <td>{m.subject || m.body.slice(0, 80)}<br /><span className="text-slate-500">{m.automationKey}</span></td>
                <td><Status value={m.status} />{m.error && <span className="block text-xs text-slate-500">{m.error}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
