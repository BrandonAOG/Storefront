import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiKeyForm } from "@/components/ApiKeyForm";
import { Saved, Status } from "@/components/admin";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { emailEnabled, smsEnabled } from "@/lib/messaging";
import { appUrl, stripeEnabled } from "@/lib/stripe";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";
import { addWebhook, createApiKey, deleteWebhook, revokeApiKey } from "../../actions";

export const dynamic = "force-dynamic";

export default async function IntegrationsAdmin({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [hooks, deliveries, keys] = await Promise.all([
    db().select().from(schema.webhooks).orderBy(desc(schema.webhooks.createdAt)),
    db().select({ d: schema.webhookDeliveries, url: schema.webhooks.url }).from(schema.webhookDeliveries).innerJoin(schema.webhooks, eq(schema.webhooks.id, schema.webhookDeliveries.webhookId)).orderBy(desc(schema.webhookDeliveries.createdAt)).limit(30),
    db().select().from(schema.apiKeys).orderBy(desc(schema.apiKeys.createdAt)),
  ]);
  const services: [string, boolean, string][] = [
    ["Online payments (Stripe)", stripeEnabled(), "STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET"],
    ["Email (Resend)", emailEnabled(), "RESEND_API_KEY, EMAIL_FROM"],
    ["Text messages (Twilio)", smsEnabled(), "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM"],
    ["Photo and video uploads (Vercel Blob)", Boolean(process.env.BLOB_READ_WRITE_TOKEN), "BLOB_READ_WRITE_TOKEN"],
    ["Daily reminders (Vercel Cron)", Boolean(process.env.CRON_SECRET), "CRON_SECRET"],
  ];
  return (
    <>
      <h1 className="text-2xl font-bold">Integrations</h1>
      <div className="mt-4"><Saved show={sp.saved === "1"} /></div>
      {sp.error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{sp.error}</p>}

      <div className="card overflow-x-auto p-0">
        <h2 className="px-5 pt-5 font-bold">Connected services</h2>
        <p className="px-5 text-sm text-slate-500">Each one switches on when its settings are added to the hosting environment. The README has the steps.</p>
        <table className="table mt-3">
          <thead><tr><th>Service</th><th>Status</th><th>Environment settings</th></tr></thead>
          <tbody>
            {services.map(([name, on, env]) => <tr key={name}><td className="font-semibold">{name}</td><td><Status value={on ? "active" : "pending"} /> {on ? "" : <span className="text-slate-500">not connected</span>}</td><td><code className="text-xs">{env}</code></td></tr>)}
          </tbody>
        </table>
      </div>

      <div className="card mt-4">
        <h2 className="font-bold">Webhooks</h2>
        <p className="text-sm text-slate-500">Send booking, estimate and feedback events to another system as they happen. Zapier (“Webhooks by Zapier”), Make and n8n can all receive these and pass them on to your dispatch or accounting tools.</p>
        <form action={addWebhook} className="mt-4 space-y-3">
          <label className="block"><span className="label">Address to send to (https://…)</span><input className="input" name="url" type="url" required maxLength={500} placeholder="https://hooks.zapier.com/…" /></label>
          <fieldset>
            <legend className="label">Events (leave all unticked to send everything)</legend>
            <div className="grid gap-1 text-sm sm:grid-cols-3">
              {WEBHOOK_EVENTS.map((e) => <label key={e} className="flex items-center gap-2"><input type="checkbox" name="events" value={e} /> <code>{e}</code></label>)}
            </div>
          </fieldset>
          <button className="btn btn-dark">Add webhook</button>
        </form>
        <ul className="mt-5 divide-y divide-slate-100 text-sm">
          {hooks.map((h) => (
            <li key={h.id} className="py-3">
              <p className="break-all font-semibold">{h.url}</p>
              <p className="text-slate-500">Events: {h.events === "*" ? "all" : h.events}</p>
              <details className="mt-1"><summary className="cursor-pointer text-slate-500">Show signing secret</summary><code className="break-all text-xs">{h.secret}</code></details>
              <form action={deleteWebhook} className="mt-1"><input type="hidden" name="id" value={h.id} /><button className="text-red-700 underline">Remove</button></form>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">Each request carries <code>X-AOG-Signature: sha256=…</code>, an HMAC-SHA256 of <code>timestamp.body</code> using the signing secret, and <code>X-AOG-Timestamp</code>.</p>
        {deliveries.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="table">
              <thead><tr><th>When</th><th>Event</th><th>To</th><th>Result</th></tr></thead>
              <tbody>
                {deliveries.map(({ d, url }) => <tr key={d.id}><td>{fmtDateTime(d.createdAt)}</td><td><code>{d.event}</code></td><td className="break-all">{url}</td><td><Status value={d.status} /> {d.responseCode ?? ""} <span className="text-xs text-slate-500">{d.error}</span></td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card mt-4">
        <h2 className="font-bold">API keys</h2>
        <p className="mb-3 text-sm text-slate-500">Read-only access to your data for other software. Send the key as <code>Authorization: Bearer …</code> to <code>{appUrl()}/api/v1/orders</code> (also <code>customers</code>, <code>visits</code>, <code>quotes</code>, <code>memberships</code>, <code>feedback</code>).</p>
        <ApiKeyForm action={createApiKey} />
        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><strong>{k.name}</strong> <code className="text-xs">{k.prefix}…</code> {k.revoked && <Status value="cancelled" />}<span className="block text-slate-500">Created {fmtDateTime(k.createdAt)} · {k.lastUsedAt ? `last used ${fmtDateTime(k.lastUsedAt)}` : "never used"}</span></span>
              {!k.revoked && <form action={revokeApiKey}><input type="hidden" name="id" value={k.id} /><button className="text-red-700 underline">Revoke</button></form>}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
