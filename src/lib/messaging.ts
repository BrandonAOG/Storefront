import "server-only";
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Customer, Message, Settings } from "@/db/schema";
import { loadAutomations, render } from "./automations";
import { appUrl } from "./stripe";

export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
export const smsEnabled = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const toHtml = (text: string) =>
  `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">${escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, "<br>")}</div>`;

/** US numbers to +1XXXXXXXXXX. Returns null when the number can't be texted. */
export function toE164(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

async function sendEmail(to: string, subject: string, text: string) {
  const res = await fetch(process.env.RESEND_API_URL ?? "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html: toHtml(text) }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
}

async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const base = process.env.TWILIO_API_URL ?? "https://api.twilio.com";
  const res = await fetch(`${base}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`SMS provider returned ${res.status}`);
}

/** Try to send one stored message and record the outcome. Never throws. */
export async function deliver(m: Message) {
  const configured = m.channel === "email" ? emailEnabled() : smsEnabled();
  if (!configured) {
    await db().update(schema.messages).set({ status: "skipped", error: `${m.channel} is not connected` }).where(eq(schema.messages.id, m.id));
    return;
  }
  try {
    if (m.channel === "email") await sendEmail(m.toAddr, m.subject, m.body);
    else await sendSms(m.toAddr, m.body);
    await db().update(schema.messages).set({ status: "sent", sentAt: new Date(), attempts: m.attempts + 1, error: "" }).where(eq(schema.messages.id, m.id));
  } catch (err) {
    // Provider errors only; the message text and address stay out of the logs.
    const error = err instanceof Error ? err.message.slice(0, 200) : "send failed";
    await db().update(schema.messages).set({ status: "failed", attempts: m.attempts + 1, error }).where(eq(schema.messages.id, m.id));
  }
}

type SendArgs = {
  key: string;
  /** What the message is about. The same key + refId is never sent twice. */
  refId: string;
  customer: Customer;
  settings: Settings;
  vars: Record<string, string>;
};

/** Queue (and immediately try to send) an automated message to a customer. */
export async function sendAutomation({ key, refId, customer, settings, vars }: SendArgs) {
  const a = (await loadAutomations()).get(key);
  if (!a || !a.enabled) return;
  if (a.marketing && customer.emailOptOut) return;

  const all = {
    name: customer.name.split(" ")[0] || "there",
    business: settings.businessName,
    phone: settings.phone,
    ...vars,
  };
  let body = render(a.body, all);
  if (a.marketing) {
    body += `\n\n--\n${settings.businessName}${settings.mailingAddress ? `\n${settings.mailingAddress}` : ""}\nUnsubscribe: ${appUrl()}/unsubscribe/${customer.token}`;
  }
  const rows: (typeof schema.messages.$inferInsert)[] = [
    { customerId: customer.id, channel: "email", toAddr: customer.email, automationKey: key, refId, subject: render(a.subject, all), body },
  ];
  const mobile = toE164(customer.phone);
  if (a.sms && customer.smsConsent && mobile && !(a.marketing && customer.emailOptOut)) {
    rows.push({ customerId: customer.id, channel: "sms", toAddr: mobile, automationKey: key, refId, body: render(a.sms, all) });
  }
  const inserted = await db().insert(schema.messages).values(rows).onConflictDoNothing().returning();
  for (const m of inserted) await deliver(m);
}

/** Plain internal alert to the business (new booking, new request, low score). */
export async function alertOwner(settings: Settings, refId: string, subject: string, text: string) {
  if (!settings.notifyEmail) return;
  const inserted = await db()
    .insert(schema.messages)
    .values({ channel: "email", toAddr: settings.notifyEmail, automationKey: "owner_alert", refId, subject, body: text })
    .onConflictDoNothing()
    .returning();
  for (const m of inserted) await deliver(m);
}

/** Retry recent messages that failed (up to 5 attempts). Called by the daily job. */
export async function retryMessages() {
  const since = new Date(Date.now() - 3 * 86400_000);
  const rows = await db()
    .select()
    .from(schema.messages)
    .where(and(inArray(schema.messages.status, ["queued", "failed"]), lt(schema.messages.attempts, 5), gt(schema.messages.createdAt, since)))
    .limit(100);
  for (const m of rows) await deliver(m);
  return rows.length;
}
