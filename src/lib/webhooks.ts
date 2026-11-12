import "server-only";
import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/db";

export const WEBHOOK_EVENTS = [
  "order.confirmed", "order.completed", "order.cancelled",
  "visit.created", "quote.sent", "quote.accepted",
  "membership.created", "membership.active", "membership.cancelled",
  "feedback.received",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

function privateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function privateIp(ip: string): boolean {
  if (isIP(ip) === 4) return privateV4(ip);
  const v = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return privateV4(mapped[1]);
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || /^fe[89ab]/.test(v) || v.startsWith("ff");
}

/**
 * SSRF guard: a webhook may only point at a public https address. Without this
 * an admin-entered URL could make the server call internal services.
 * Returns an error message, or null when the URL is acceptable.
 */
export async function checkWebhookUrl(raw: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Enter a full address starting with https://";
  }
  if (url.protocol !== "https:") return "The address must start with https://";
  if (url.username || url.password) return "The address can't contain a username or password";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return privateIp(host) ? "That address is not reachable from the internet" : null;
  if (host === "localhost" || /\.(local|internal|localhost)$/i.test(host)) return "That address is not reachable from the internet";
  try {
    const addrs = await lookup(host, { all: true });
    if (addrs.length === 0 || addrs.some((a) => privateIp(a.address))) return "That address is not reachable from the internet";
  } catch {
    return "That address could not be found";
  }
  return null;
}

export function sign(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

async function attempt(d: typeof schema.webhookDeliveries.$inferSelect, hook: typeof schema.webhooks.$inferSelect) {
  const body = JSON.stringify({ id: d.id, event: d.event, created: d.createdAt.toISOString(), data: d.payload });
  const ts = String(Math.floor(Date.now() / 1000));
  let status = "failed";
  let responseCode: number | null = null;
  let error = "";
  try {
    const blocked = await checkWebhookUrl(hook.url); // re-checked on every send, DNS can change
    if (blocked) throw new Error(blocked);
    const res = await fetch(hook.url, {
      method: "POST",
      redirect: "manual", // a redirect could point somewhere internal
      headers: { "Content-Type": "application/json", "User-Agent": "AOG-Storefront-Webhook/1", "X-AOG-Event": d.event, "X-AOG-Timestamp": ts, "X-AOG-Signature": `sha256=${sign(hook.secret, ts, body)}` },
      body,
      signal: AbortSignal.timeout(5000),
    });
    responseCode = res.status;
    if (res.status >= 200 && res.status < 300) status = "sent";
    else error = `Receiver answered ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 200) : "delivery failed";
  }
  await db().update(schema.webhookDeliveries).set({ status, responseCode, error, attempts: d.attempts + 1 }).where(eq(schema.webhookDeliveries.id, d.id));
}

/** Record an event for every matching webhook and try to deliver it. Never throws. */
export async function emit(event: WebhookEvent, payload: Record<string, unknown>) {
  try {
    const hooks = await db().select().from(schema.webhooks).where(eq(schema.webhooks.active, true));
    for (const hook of hooks) {
      const wanted = hook.events.split(",").map((e) => e.trim());
      if (!wanted.includes("*") && !wanted.includes(event)) continue;
      const [d] = await db().insert(schema.webhookDeliveries).values({ webhookId: hook.id, event, payload }).returning();
      await attempt(d, hook);
    }
  } catch (err) {
    console.error("Webhook emit failed:", err instanceof Error ? err.message : "unknown error");
  }
}

export async function retryWebhooks() {
  const since = new Date(Date.now() - 3 * 86400_000);
  const rows = await db()
    .select({ d: schema.webhookDeliveries, hook: schema.webhooks })
    .from(schema.webhookDeliveries)
    .innerJoin(schema.webhooks, eq(schema.webhooks.id, schema.webhookDeliveries.webhookId))
    .where(and(inArray(schema.webhookDeliveries.status, ["queued", "failed"]), lt(schema.webhookDeliveries.attempts, 5), gt(schema.webhookDeliveries.createdAt, since), eq(schema.webhooks.active, true)))
    .limit(100);
  for (const r of rows) await attempt(r.d, r.hook);
  return rows.length;
}
