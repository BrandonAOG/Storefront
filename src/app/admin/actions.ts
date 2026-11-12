"use server";

import { createHash, randomBytes } from "node:crypto";
import { put } from "@vercel/blob";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { endSession, passwordMatches, requireAdmin, startSession } from "@/lib/auth";
import { AUTOMATIONS } from "@/lib/automations";
import { runDailyJobs } from "@/lib/cron";
import { upsertCustomer } from "@/lib/customers";
import { zoneToDate } from "@/lib/format";
import { membershipChanged, orderChanged, orderConfirmed, quoteSent, visitScheduled } from "@/lib/notify";
import { rateLimit } from "@/lib/ratelimit";
import { parseZips } from "@/lib/settings";
import { checkWebhookUrl, WEBHOOK_EVENTS } from "@/lib/webhooks";

// Every action below (except login) starts with requireAdmin(): server actions
// are reachable by direct POST, so the page-level check alone is not enough.

const str = (fd: FormData, key: string, max = 500) => String(fd.get(key) ?? "").trim().slice(0, max);
const int = (fd: FormData, key: string, min: number, max: number, fallback: number) => {
  const n = Number.parseInt(String(fd.get(key) ?? ""), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const cents = (fd: FormData, key: string) => {
  const n = Number.parseFloat(String(fd.get(key) ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.min(100_000_000, Math.max(0, Math.round(n * 100))) : 0;
};
const minutes = (fd: FormData, key: string, fallback: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(fd.get(key) ?? ""));
  return m ? Math.min(1440, Number(m[1]) * 60 + Number(m[2])) : fallback;
};
const httpsUrl = (fd: FormData, key: string, max = 500) => {
  const v = str(fd, key, max);
  return /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : "";
};
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export async function login(fd: FormData) {
  if (!(await rateLimit("login", 5, 900))) redirect("/admin/login?error=locked");
  if (!passwordMatches(String(fd.get("password") ?? ""))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    redirect("/admin/login?error=1");
  }
  await startSession();
  redirect("/admin");
}

export async function logout() {
  await endSession();
  redirect("/admin/login");
}

export async function saveSettings(fd: FormData) {
  await requireAdmin();
  await db()
    .update(schema.settings)
    .set({
      businessName: str(fd, "businessName", 120) || "Always On Generators",
      phone: str(fd, "phone", 30),
      email: str(fd, "email", 200),
      serviceZips: parseZips(str(fd, "serviceZips", 20000)).join(", "),
      depositPercent: int(fd, "depositPercent", 0, 100, 100),
      notifyEmail: z.string().email().safeParse(str(fd, "notifyEmail", 200)).success ? str(fd, "notifyEmail", 200) : "",
      reviewUrl: httpsUrl(fd, "reviewUrl"),
      mailingAddress: str(fd, "mailingAddress", 300),
      heroHeadline: str(fd, "heroHeadline", 160) || "Generator service, priced upfront. Book it in two minutes.",
      heroSub: str(fd, "heroSub", 300),
      abEnabled: fd.get("abEnabled") === "on",
      heroHeadlineB: str(fd, "heroHeadlineB", 160),
      heroSubB: str(fd, "heroSubB", 300),
    })
    .where(eq(schema.settings.id, 1));
  revalidatePath("/", "layout");
  redirect("/admin/settings?saved=1");
}

export async function saveScheduling(fd: FormData) {
  await requireAdmin();
  await db()
    .update(schema.settings)
    .set({
      slotMinutes: int(fd, "slotMinutes", 30, 720, 120),
      slotCapacity: int(fd, "slotCapacity", 1, 50, 1),
      leadDays: int(fd, "leadDays", 0, 60, 1),
      horizonDays: int(fd, "horizonDays", 1, 180, 30),
    })
    .where(eq(schema.settings.id, 1));
  for (let weekday = 0; weekday < 7; weekday++) {
    const startMin = minutes(fd, `start-${weekday}`, 480);
    const endMin = Math.max(startMin, minutes(fd, `end-${weekday}`, 960));
    const row = { weekday, open: fd.get(`open-${weekday}`) === "on", startMin, endMin };
    await db().insert(schema.hours).values(row).onConflictDoUpdate({ target: schema.hours.weekday, set: row });
  }
  redirect("/admin/availability?saved=1");
}

export async function addBlackout(fd: FormData) {
  await requireAdmin();
  const day = str(fd, "day", 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    await db().insert(schema.blackouts).values({ day, note: str(fd, "note", 120) }).onConflictDoNothing();
  }
  redirect("/admin/availability");
}

export async function removeBlackout(fd: FormData) {
  await requireAdmin();
  await db().delete(schema.blackouts).where(eq(schema.blackouts.day, str(fd, "day", 10)));
  redirect("/admin/availability");
}

async function uniqueSlug(table: typeof schema.services | typeof schema.plans, wanted: string, selfId: number | null) {
  const base = wanted || "item";
  const clash = await db()
    .select({ id: table.id })
    .from(table)
    .where(selfId ? and(eq(table.slug, base), ne(table.id, selfId)) : eq(table.slug, base));
  return clash.length ? `${base}-${randomBytes(2).toString("hex")}` : base;
}

export async function saveService(fd: FormData) {
  await requireAdmin();
  const id = int(fd, "id", 0, 2 ** 31 - 1, 0) || null;
  const name = str(fd, "name", 120);
  if (!name) redirect(id ? `/admin/services/${id}?error=name` : "/admin/services/new?error=name");
  // Photo: an uploaded file wins over a pasted address. Files go to Vercel Blob.
  let imageUrl = httpsUrl(fd, "imageUrl");
  const file = fd.get("image");
  if (file instanceof File && file.size > 0 && process.env.BLOB_READ_WRITE_TOKEN) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024) {
      redirect(id ? `/admin/services/${id}?error=image` : "/admin/services/new?error=image");
    }
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    imageUrl = (await put(`services/${slugify(name) || "service"}.${ext}`, file, { access: "public", addRandomSuffix: true, contentType: file.type })).url;
  }
  const values = {
    name,
    imageUrl,
    includes: str(fd, "includes", 2000),
    zips: parseZips(str(fd, "zips", 20000)).join(", "),
    leadDays: int(fd, "leadDays", 0, 60, 0),
    slug: await uniqueSlug(schema.services, slugify(str(fd, "slug", 80) || name), id),
    category: str(fd, "category", 60) || "Service",
    summary: str(fd, "summary", 300),
    description: str(fd, "description", 5000),
    priceType: fd.get("priceType") === "quote" ? "quote" : "fixed",
    priceCents: cents(fd, "price"),
    active: fd.get("active") === "on",
    sortOrder: int(fd, "sortOrder", -1000, 1000, 0),
  };
  if (id) await db().update(schema.services).set(values).where(eq(schema.services.id, id));
  else await db().insert(schema.services).values(values);
  redirect("/admin/services");
}

export async function deleteService(fd: FormData) {
  await requireAdmin();
  await db().delete(schema.services).where(eq(schema.services.id, int(fd, "id", 0, 2 ** 31 - 1, 0)));
  redirect("/admin/services");
}

export async function savePlan(fd: FormData) {
  await requireAdmin();
  const id = int(fd, "id", 0, 2 ** 31 - 1, 0) || null;
  const name = str(fd, "name", 120);
  if (!name) redirect(id ? `/admin/plans/${id}?error=name` : "/admin/plans/new?error=name");
  const values = {
    name,
    slug: await uniqueSlug(schema.plans, slugify(str(fd, "slug", 80) || name), id),
    summary: str(fd, "summary", 300),
    features: str(fd, "features", 3000),
    priceCents: cents(fd, "price"),
    interval: fd.get("interval") === "month" ? "month" : "year",
    active: fd.get("active") === "on",
    sortOrder: int(fd, "sortOrder", -1000, 1000, 0),
  };
  if (id) await db().update(schema.plans).set(values).where(eq(schema.plans.id, id));
  else await db().insert(schema.plans).values(values);
  redirect("/admin/plans");
}

export async function deletePlan(fd: FormData) {
  await requireAdmin();
  await db().delete(schema.plans).where(eq(schema.plans.id, int(fd, "id", 0, 2 ** 31 - 1, 0)));
  redirect("/admin/plans");
}

const uuid = z.string().uuid();

export async function updateOrder(fd: FormData) {
  await requireAdmin();
  const id = uuid.parse(fd.get("id"));
  const status = z.enum(["pending", "confirmed", "completed", "cancelled"]).parse(fd.get("status"));
  const paymentStatus = z.enum(["unpaid", "paid", "refunded"]).parse(fd.get("paymentStatus"));
  const [before] = await db().select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!before) redirect("/admin/orders");
  await db()
    .update(schema.orders)
    .set({ status, paymentStatus, completedAt: status === "completed" ? (before.completedAt ?? new Date()) : null })
    .where(eq(schema.orders.id, id));
  if (before.status !== status) {
    if (status === "confirmed") after(() => orderConfirmed(id));
    if (status === "completed") after(() => orderChanged(id, "order.completed"));
    if (status === "cancelled") after(() => orderChanged(id, "order.cancelled"));
  }
  redirect(`/admin/orders/${id}?saved=1`);
}

export async function updateVisit(fd: FormData) {
  await requireAdmin();
  const id = uuid.parse(fd.get("id"));
  let status = z.enum(["new", "scheduled", "done", "closed"]).parse(fd.get("status"));
  const [before] = await db().select().from(schema.visits).where(eq(schema.visits.id, id));
  if (!before) redirect("/admin/visits");
  // Date and time are typed in the business's time zone. Clearing either clears the appointment.
  const scheduledAt = zoneToDate(str(fd, "schedDay", 10), str(fd, "schedTime", 5));
  const timeChanged = (scheduledAt?.getTime() ?? 0) !== (before.scheduledAt?.getTime() ?? 0);
  // Setting a time on a new request marks it scheduled.
  if (scheduledAt && timeChanged && status === "new") status = "scheduled";
  // Only https links are stored, so the link can never be a javascript: URL.
  await db().update(schema.visits).set({ status, scheduledAt, meetingUrl: httpsUrl(fd, "meetingUrl"), adminNotes: str(fd, "adminNotes", 2000) }).where(eq(schema.visits.id, id));
  if (scheduledAt && timeChanged && scheduledAt.getTime() > Date.now()) after(() => visitScheduled(id));
  redirect(`/admin/visits/${id}?saved=1`);
}

export async function addVisitNote(fd: FormData) {
  await requireAdmin();
  const visitId = uuid.parse(fd.get("visitId"));
  const body = str(fd, "body", 1000);
  const media = uuid.safeParse(fd.get("mediaId"));
  const at = Number.parseInt(String(fd.get("atSeconds") ?? ""), 10);
  if (body) {
    await db().insert(schema.visitNotes).values({ visitId, body, mediaId: media.success ? media.data : null, atSeconds: Number.isFinite(at) && at >= 0 ? Math.min(at, 86400) : null });
  }
  redirect(`/admin/visits/${visitId}`);
}

/** Add a note from the call room and return the updated list (no page reload mid-call). */
export async function addCallNote(visitId: string, body: string) {
  await requireAdmin();
  const id = uuid.parse(visitId);
  const text = String(body ?? "").trim().slice(0, 1000);
  if (text) await db().insert(schema.visitNotes).values({ visitId: id, body: text });
  const rows = await db().select({ id: schema.visitNotes.id, body: schema.visitNotes.body }).from(schema.visitNotes).where(eq(schema.visitNotes.visitId, id)).orderBy(schema.visitNotes.createdAt);
  return rows;
}

/** The current photos and snapshots for a visit, for refreshing the call room without reloading it. */
export async function listShots(visitId: string) {
  await requireAdmin();
  const id = uuid.parse(visitId);
  const rows = await db().select().from(schema.visitMedia).where(eq(schema.visitMedia.visitId, id)).orderBy(schema.visitMedia.createdAt);
  return rows.filter((m) => m.contentType.startsWith("image/")).map((m) => ({ id: m.id, url: m.url, name: m.name || "Photo", meta: m.meta ?? null }));
}

const linePoints = { ax: z.number().finite(), ay: z.number().finite(), bx: z.number().finite(), by: z.number().finite() };
const measureSchema = z.object({
  w: z.number().int().positive().max(20000),
  h: z.number().int().positive().max(20000),
  scale: z.object({ ...linePoints, inches: z.number().positive().max(100000) }).nullable(),
  rect: z
    .object({ pts: z.array(z.object({ x: z.number().finite(), y: z.number().finite() })).length(4), widthIn: z.number().positive().max(100000), heightIn: z.number().positive().max(100000) })
    .nullish(),
  lines: z.array(z.object(linePoints)).max(40),
});

/** Save the scale and measured lines drawn on a photo or snapshot. */
export async function saveMeasurements(mediaId: string, meta: unknown): Promise<{ ok: boolean }> {
  await requireAdmin();
  const id = uuid.safeParse(mediaId);
  const parsed = measureSchema.safeParse(meta);
  if (!id.success || !parsed.success) return { ok: false };
  const changed = await db().update(schema.visitMedia).set({ meta: parsed.data }).where(eq(schema.visitMedia.id, id.data)).returning({ id: schema.visitMedia.id });
  return { ok: changed.length > 0 };
}

export async function deleteVisitNote(fd: FormData) {
  await requireAdmin();
  const visitId = uuid.parse(fd.get("visitId"));
  await db().delete(schema.visitNotes).where(and(eq(schema.visitNotes.id, uuid.parse(fd.get("id"))), eq(schema.visitNotes.visitId, visitId)));
  redirect(`/admin/visits/${visitId}`);
}

export async function updateMembership(fd: FormData) {
  await requireAdmin();
  const id = uuid.parse(fd.get("id"));
  const status = z.enum(["pending", "active", "cancelled"]).parse(fd.get("status"));
  const [before] = await db().select().from(schema.memberships).where(eq(schema.memberships.id, id));
  await db().update(schema.memberships).set({ status, cancelledAt: status === "cancelled" ? new Date() : null }).where(eq(schema.memberships.id, id));
  if (before && before.status !== status && status !== "pending") {
    after(() => membershipChanged(id, status === "active" ? "membership.active" : "membership.cancelled"));
  }
  redirect("/admin/memberships");
}

export async function saveCustomer(fd: FormData) {
  await requireAdmin();
  const id = uuid.parse(fd.get("id"));
  await db()
    .update(schema.customers)
    .set({ notes: str(fd, "notes", 3000), emailOptOut: fd.get("emailOptOut") === "on", smsConsent: fd.get("smsConsent") === "on" })
    .where(eq(schema.customers.id, id));
  redirect(`/admin/customers/${id}?saved=1`);
}

const QUOTE_ROWS = 10;

/** Create or update an estimate. intent=send also emails it to the customer. */
export async function saveQuote(fd: FormData) {
  await requireAdmin();
  const idIn = uuid.safeParse(fd.get("id"));
  const send = fd.get("intent") === "send";

  const items = [];
  for (let i = 0; i < QUOTE_ROWS; i++) {
    const name = str(fd, `name-${i}`, 160);
    if (!name) continue;
    items.push({ name, description: str(fd, `desc-${i}`, 1000), priceCents: cents(fd, `price-${i}`), qty: int(fd, `qty-${i}`, 1, 999, 1), optional: fd.get(`optional-${i}`) === "on" });
  }
  const expires = str(fd, "expiresDay", 10);
  const values = {
    title: str(fd, "title", 160) || "Your estimate",
    message: str(fd, "message", 3000),
    depositPercent: int(fd, "depositPercent", 0, 100, 0),
    expiresDay: /^\d{4}-\d{2}-\d{2}$/.test(expires) ? expires : null,
    // Shown in lists before the customer chooses add-ons: the required items only.
    totalCents: items.filter((i) => !i.optional).reduce((sum, i) => sum + i.priceCents * i.qty, 0),
  };

  let id: string;
  if (idIn.success) {
    id = idIn.data;
    const [q] = await db().select().from(schema.quotes).where(eq(schema.quotes.id, id));
    // An accepted estimate is a record of what the customer agreed to; it can't be edited.
    if (!q || q.status === "accepted") redirect(`/admin/quotes/${id}?error=locked`);
    await db().update(schema.quotes).set(values).where(eq(schema.quotes.id, id));
    await db().delete(schema.quoteItems).where(eq(schema.quoteItems.quoteId, id));
  } else {
    const contact = z.object({ name: z.string().min(1), email: z.string().email(), phone: z.string() }).safeParse({ name: str(fd, "custName", 120), email: str(fd, "custEmail", 200).toLowerCase(), phone: str(fd, "custPhone", 30) });
    if (!contact.success) redirect("/admin/quotes/new?error=customer");
    const customer = await upsertCustomer(contact.data);
    const visit = uuid.safeParse(fd.get("visitId"));
    const [q] = await db().insert(schema.quotes).values({ ...values, token: randomBytes(24).toString("hex"), customerId: customer.id, visitId: visit.success ? visit.data : null }).returning();
    id = q.id;
  }
  if (items.length) await db().insert(schema.quoteItems).values(items.map((i) => ({ ...i, quoteId: id })));

  if (send) {
    if (!items.some((i) => !i.optional)) redirect(`/admin/quotes/${id}?error=items`);
    await db().update(schema.quotes).set({ status: "sent", sentAt: new Date(), viewedAt: null }).where(eq(schema.quotes.id, id));
    after(() => quoteSent(id));
    redirect(`/admin/quotes/${id}?sent=1`);
  }
  redirect(`/admin/quotes/${id}?saved=1`);
}

export async function setQuoteStatus(fd: FormData) {
  await requireAdmin();
  const id = uuid.parse(fd.get("id"));
  const status = z.enum(["draft", "declined"]).parse(fd.get("status"));
  await db().update(schema.quotes).set({ status }).where(and(eq(schema.quotes.id, id), ne(schema.quotes.status, "accepted")));
  redirect(`/admin/quotes/${id}?saved=1`);
}

export async function saveAutomation(fd: FormData) {
  await requireAdmin();
  const key = str(fd, "key", 60);
  const def = AUTOMATIONS.find((a) => a.key === key);
  if (!def) redirect("/admin/messages");
  const row = {
    key,
    enabled: fd.get("enabled") === "on",
    delayDays: int(fd, "delayDays", 0, 3650, def.delayDays),
    subject: str(fd, "subject", 200),
    body: str(fd, "body", 5000),
    sms: str(fd, "sms", 320),
  };
  await db().insert(schema.automations).values(row).onConflictDoUpdate({ target: schema.automations.key, set: row });
  redirect(`/admin/messages?saved=${encodeURIComponent(key)}#${encodeURIComponent(key)}`);
}

export async function resetAutomation(fd: FormData) {
  await requireAdmin();
  await db().delete(schema.automations).where(eq(schema.automations.key, str(fd, "key", 60)));
  redirect("/admin/messages");
}

export async function runJobsNow() {
  await requireAdmin();
  const done = await runDailyJobs();
  const summary = Object.entries(done).filter(([, n]) => n > 0).map(([k, n]) => `${k}: ${n}`).join(", ") || "nothing due";
  redirect(`/admin/messages?ran=${encodeURIComponent(summary)}`);
}

export async function addWebhook(fd: FormData) {
  await requireAdmin();
  const url = str(fd, "url", 500);
  const problem = await checkWebhookUrl(url);
  if (problem) redirect(`/admin/integrations?error=${encodeURIComponent(problem)}`);
  const picked = fd.getAll("events").map(String).filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e));
  await db().insert(schema.webhooks).values({ url, secret: `whsec_${randomBytes(24).toString("hex")}`, events: picked.length ? picked.join(",") : "*" });
  redirect("/admin/integrations?saved=1");
}

export async function deleteWebhook(fd: FormData) {
  await requireAdmin();
  await db().delete(schema.webhooks).where(eq(schema.webhooks.id, uuid.parse(fd.get("id"))));
  redirect("/admin/integrations");
}

/** Returns the new key once. Only its SHA-256 hash is stored. */
export async function createApiKey(_prev: { key?: string; error?: string }, fd: FormData): Promise<{ key?: string; error?: string }> {
  await requireAdmin();
  const name = str(fd, "name", 80);
  if (!name) return { error: "Give the key a name so you can recognise it later." };
  const key = `aog_${randomBytes(32).toString("hex")}`;
  await db().insert(schema.apiKeys).values({ name, prefix: key.slice(0, 12), hash: createHash("sha256").update(key).digest("hex") });
  revalidatePath("/admin/integrations");
  return { key };
}

export async function revokeApiKey(fd: FormData) {
  await requireAdmin();
  await db().update(schema.apiKeys).set({ revoked: true }).where(eq(schema.apiKeys.id, uuid.parse(fd.get("id"))));
  redirect("/admin/integrations");
}
