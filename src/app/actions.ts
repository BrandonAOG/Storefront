"use server";

import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { upsertCustomer } from "@/lib/customers";
import { feedbackReceived, membershipChanged, orderConfirmed, quoteAccepted, visitCreated } from "@/lib/notify";
import { getSettings, parseZips, zipServed } from "@/lib/settings";
import { countOccupied, findSlot, todayLocal } from "@/lib/slots";
import { rateLimit } from "@/lib/ratelimit";
import { appUrl, stripe, stripeEnabled } from "@/lib/stripe";
import { firstError, membershipSchema, orderSchema, visitSchema } from "@/lib/validation";
import { getAttribution, type Attribution } from "@/lib/visitor";

export type ActionResult = { ok: true; url: string } | { ok: false; error: string };

const BUSY = "Too many requests. Please wait a minute and try again.";
const newToken = () => randomBytes(24).toString("hex");
const isToken = (t: unknown): t is string => typeof t === "string" && /^[a-f0-9]{48}$/.test(t);
const attrCols = (a: Attribution) => ({ visitorId: a.visitorId, source: a.source, medium: a.medium, campaign: a.campaign, variant: a.variant });

/** Count a completed step in the anonymous funnel. */
async function logEvent(a: Attribution, type: "order" | "visit" | "membership") {
  if (!a.visitorId) return;
  await db().insert(schema.events).values({ visitorId: a.visitorId, type, source: a.source, medium: a.medium, campaign: a.campaign, variant: a.variant });
}

/** Create a booking. Prices always come from the database, never from the browser. */
export async function createOrder(input: unknown): Promise<ActionResult> {
  if (!(await rateLimit("order", 8, 600))) return { ok: false, error: BUSY };
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const data = parsed.data;
  if (data.website) return { ok: false, error: "Could not submit the form." };

  const s = await getSettings();
  if (!zipServed(s, data.zip)) {
    return { ok: false, error: `Sorry, we don't service ZIP code ${data.zip} yet. Call us and we'll see what we can do.` };
  }

  const ids = [...new Set(data.items.map((i) => i.serviceId))];
  const found = await db()
    .select()
    .from(schema.services)
    .where(and(inArray(schema.services.id, ids), eq(schema.services.active, true), eq(schema.services.priceType, "fixed")));
  if (found.length !== ids.length) {
    return { ok: false, error: "One of the services in your cart is no longer available. Please review your cart." };
  }
  // Per-service rules: some services are only offered in certain ZIP codes.
  const zip5 = data.zip.slice(0, 5);
  const limited = found.find((f) => parseZips(f.zips).length > 0 && !parseZips(f.zips).includes(zip5));
  if (limited) return { ok: false, error: `Sorry, "${limited.name}" isn't offered in ZIP code ${zip5}. Remove it from your booking or call us.` };

  const byId = new Map(found.map((x) => [x.id, x]));
  const qtyById = new Map<number, number>();
  for (const i of data.items) qtyById.set(i.serviceId, Math.min(10, (qtyById.get(i.serviceId) ?? 0) + i.qty));
  const lines = [...qtyById].map(([id, qty]) => ({ service: byId.get(id)!, qty }));
  const subtotalCents = lines.reduce((sum, l) => sum + l.service.priceCents * l.qty, 0);
  const pct = Math.min(100, Math.max(0, s.depositPercent));
  const online = stripeEnabled() && pct > 0 && subtotalCents > 0;
  const dueNowCents = online ? Math.round((subtotalCents * pct) / 100) : 0;

  const lead = Math.max(0, ...found.map((f) => f.leadDays));
  const slot = await findSlot(s, data.day, data.startMin, lead);
  if (!slot) return { ok: false, error: "That time is no longer offered. Please pick another." };

  const attr = await getAttribution(s);
  const customer = await upsertCustomer(data, attr, data.smsConsent);

  const token = newToken();
  const order = await db().transaction(async (tx) => {
    // Serialize bookings for the same window so two customers can't take the last spot.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${data.day}|${data.startMin}`}))`);
    if ((await countOccupied(tx, data.day, data.startMin)) >= s.slotCapacity) return null;
    const [row] = await tx
      .insert(schema.orders)
      .values({
        token,
        status: online ? "pending" : "confirmed",
        name: data.name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        city: data.city,
        zip: data.zip,
        notes: data.notes,
        day: data.day,
        startMin: slot.startMin,
        endMin: slot.endMin,
        subtotalCents,
        dueNowCents,
        customerId: customer.id,
        ...attrCols(attr),
      })
      .returning();
    await tx.insert(schema.orderItems).values(
      lines.map((l) => ({ orderId: row.id, serviceId: l.service.id, name: l.service.name, priceCents: l.service.priceCents, qty: l.qty })),
    );
    return row;
  });
  if (!order) return { ok: false, error: "That time was just taken. Please pick another." };
  await logEvent(attr, "order");

  if (!online) {
    after(() => orderConfirmed(order.id));
    return { ok: true, url: `/order/${token}` };
  }

  try {
    const deposit = pct < 100;
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer_email: data.email,
      line_items: deposit
        ? [{ quantity: 1, price_data: { currency: "usd", unit_amount: dueNowCents, product_data: { name: `${pct}% deposit – ${lines.map((l) => l.service.name).join(", ")}`.slice(0, 250) } } }]
        : lines.map((l) => ({ quantity: l.qty, price_data: { currency: "usd", unit_amount: l.service.priceCents, product_data: { name: l.service.name } } })),
      metadata: { kind: "order", id: order.id },
      // Stripe's minimum session lifetime is 30 minutes, matching the slot hold.
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: `${appUrl()}/order/${token}`,
      cancel_url: `${appUrl()}/order/${token}?cancelled=1`,
    });
    await db().update(schema.orders).set({ stripeSessionId: session.id }).where(eq(schema.orders.id, order.id));
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    return { ok: true, url: session.url };
  } catch (err) {
    // Release the slot; log the cause without any customer details.
    await db().update(schema.orders).set({ status: "cancelled" }).where(eq(schema.orders.id, order.id));
    console.error("Stripe checkout failed:", err instanceof Error ? err.message : "unknown error");
    return { ok: false, error: "We couldn't start the payment. Please try again or call us." };
  }
}

export async function createMembership(input: unknown): Promise<ActionResult> {
  if (!(await rateLimit("membership", 5, 600))) return { ok: false, error: BUSY };
  const parsed = membershipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const data = parsed.data;
  if (data.website) return { ok: false, error: "Could not submit the form." };

  const s = await getSettings();
  if (!zipServed(s, data.zip)) return { ok: false, error: `Sorry, we don't service ZIP code ${data.zip} yet.` };

  const [plan] = await db()
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.id, data.planId), eq(schema.plans.active, true)));
  if (!plan) return { ok: false, error: "That plan is no longer available." };
  const interval = plan.interval === "month" ? "month" : "year";

  const attr = await getAttribution(s);
  const customer = await upsertCustomer(data, attr, data.smsConsent);
  const token = newToken();
  const [m] = await db()
    .insert(schema.memberships)
    .values({
      token,
      planId: plan.id,
      planName: plan.name,
      priceCents: plan.priceCents,
      interval,
      name: data.name,
      email: data.email,
      phone: data.phone,
      address: data.address,
      city: data.city,
      zip: data.zip,
      generator: data.generator,
      customerId: customer.id,
      ...attrCols(attr),
    })
    .returning();
  await logEvent(attr, "membership");

  if (!stripeEnabled() || plan.priceCents <= 0) {
    after(() => membershipChanged(m.id, "membership.created"));
    return { ok: true, url: `/plans/thanks/${token}` };
  }

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer_email: data.email,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: plan.priceCents, recurring: { interval }, product_data: { name: plan.name } } }],
      metadata: { kind: "membership", id: m.id },
      subscription_data: { metadata: { kind: "membership", id: m.id } },
      success_url: `${appUrl()}/plans/thanks/${token}`,
      cancel_url: `${appUrl()}/plans/${plan.slug}`,
    });
    await db().update(schema.memberships).set({ stripeSessionId: session.id }).where(eq(schema.memberships.id, m.id));
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    return { ok: true, url: session.url };
  } catch (err) {
    await db().update(schema.memberships).set({ status: "cancelled" }).where(eq(schema.memberships.id, m.id));
    console.error("Stripe subscription checkout failed:", err instanceof Error ? err.message : "unknown error");
    return { ok: false, error: "We couldn't start the payment. Please try again or call us." };
  }
}

/** Opens Stripe's billing page so a member can update their card or cancel. */
export async function manageBilling(token: unknown): Promise<ActionResult> {
  if (!isToken(token) || !stripeEnabled()) return { ok: false, error: "Billing can't be managed online. Please call us." };
  if (!(await rateLimit("billing", 10, 600))) return { ok: false, error: BUSY };
  const [m] = await db().select().from(schema.memberships).where(eq(schema.memberships.token, token));
  if (!m?.stripeCustomerId) return { ok: false, error: "Billing can't be managed online for this plan. Please call us." };
  try {
    const session = await stripe().billingPortal.sessions.create({ customer: m.stripeCustomerId, return_url: `${appUrl()}/plans/thanks/${token}` });
    return { ok: true, url: session.url };
  } catch (err) {
    console.error("Stripe billing portal failed:", err instanceof Error ? err.message : "unknown error");
    return { ok: false, error: "We couldn't open billing right now. Please call us." };
  }
}

export async function createVisit(input: unknown): Promise<ActionResult> {
  if (!(await rateLimit("visit", 5, 600))) return { ok: false, error: BUSY };
  const parsed = visitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { website, smsConsent, ...data } = parsed.data;
  if (website) return { ok: false, error: "Could not submit the form." };
  const attr = await getAttribution(await getSettings());
  const customer = await upsertCustomer(data, attr, smsConsent);
  const token = newToken();
  const [v] = await db().insert(schema.visits).values({ ...data, token, customerId: customer.id, ...attrCols(attr) }).returning();
  await logEvent(attr, "visit");
  after(() => visitCreated(v.id));
  return { ok: true, url: `/visit/${token}` };
}

const MAX_MEDIA = 10;
const mediaSchema = z.object({
  url: z.string().url().max(600),
  name: z.string().max(200).default(""),
  contentType: z.string().max(100).regex(/^(image|video)\//),
  size: z.number().int().min(1).max(250 * 1024 * 1024),
});

/** Record a file the customer just uploaded for their virtual visit. */
export async function attachVisitMedia(token: unknown, input: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!isToken(token)) return { ok: false, error: "Invalid link." };
  if (!(await rateLimit("media", 30, 600))) return { ok: false, error: BUSY };
  const parsed = mediaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That file couldn't be saved." };
  // Only accept files that really live in this project's Vercel Blob storage.
  const host = new URL(parsed.data.url).hostname;
  if (!/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(host)) return { ok: false, error: "That file couldn't be saved." };
  const [v] = await db().select().from(schema.visits).where(eq(schema.visits.token, token));
  if (!v) return { ok: false, error: "Invalid link." };
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.visitMedia).where(eq(schema.visitMedia.visitId, v.id));
  if (n >= MAX_MEDIA) return { ok: false, error: `You can add up to ${MAX_MEDIA} files.` };
  await db().insert(schema.visitMedia).values({ visitId: v.id, ...parsed.data });
  return { ok: true };
}

/** Customer accepts an estimate, choosing which optional items to include. */
export async function acceptQuote(token: unknown, optionalIds: unknown): Promise<ActionResult> {
  if (!isToken(token)) return { ok: false, error: "Invalid link." };
  if (!(await rateLimit("quote", 10, 600))) return { ok: false, error: BUSY };
  const chosen = z.array(z.number().int().positive()).max(50).safeParse(optionalIds);
  if (!chosen.success) return { ok: false, error: "Please try again." };

  const [q] = await db().select().from(schema.quotes).where(eq(schema.quotes.token, token));
  if (!q || q.status !== "sent") return { ok: false, error: "This estimate can no longer be accepted online. Please call us." };
  if (q.expiresDay && q.expiresDay < todayLocal()) return { ok: false, error: "This estimate has expired. Please call us for an updated one." };

  const items = await db().select().from(schema.quoteItems).where(eq(schema.quoteItems.quoteId, q.id));
  const picked = new Set(chosen.data);
  const included = items.filter((i) => !i.optional || picked.has(i.id));
  const totalCents = included.reduce((sum, i) => sum + i.priceCents * i.qty, 0);
  const pct = Math.min(100, Math.max(0, q.depositPercent));
  const online = stripeEnabled() && pct > 0 && totalCents > 0;
  const dueNowCents = online ? Math.round((totalCents * pct) / 100) : 0;

  for (const i of items.filter((x) => x.optional)) {
    await db().update(schema.quoteItems).set({ selected: picked.has(i.id) }).where(eq(schema.quoteItems.id, i.id));
  }

  if (!online) {
    const changed = await db()
      .update(schema.quotes)
      .set({ status: "accepted", acceptedAt: new Date(), totalCents, dueNowCents: 0 })
      .where(and(eq(schema.quotes.id, q.id), eq(schema.quotes.status, "sent")))
      .returning({ id: schema.quotes.id });
    if (changed.length) after(() => quoteAccepted(q.id));
    return { ok: true, url: `/quote/${token}` };
  }

  try {
    const [customer] = await db().select().from(schema.customers).where(eq(schema.customers.id, q.customerId));
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer_email: customer?.email,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: dueNowCents, product_data: { name: (pct < 100 ? `${pct}% deposit – ${q.title}` : q.title).slice(0, 250) } } }],
      metadata: { kind: "quote", id: q.id },
      success_url: `${appUrl()}/quote/${token}`,
      cancel_url: `${appUrl()}/quote/${token}`,
    });
    // The estimate stays "sent" until Stripe confirms the payment.
    await db().update(schema.quotes).set({ totalCents, dueNowCents, stripeSessionId: session.id }).where(eq(schema.quotes.id, q.id));
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    return { ok: true, url: session.url };
  } catch (err) {
    console.error("Stripe quote checkout failed:", err instanceof Error ? err.message : "unknown error");
    return { ok: false, error: "We couldn't start the payment. Please try again or call us." };
  }
}

export async function submitFeedback(token: unknown, score: unknown, comment: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!isToken(token)) return { ok: false, error: "Invalid link." };
  if (!(await rateLimit("feedback", 10, 600))) return { ok: false, error: BUSY };
  const parsed = z.object({ score: z.number().int().min(0).max(10), comment: z.string().trim().max(2000) }).safeParse({ score, comment });
  if (!parsed.success) return { ok: false, error: "Please choose a score from 0 to 10." };
  const changed = await db()
    .update(schema.feedback)
    .set({ score: parsed.data.score, comment: parsed.data.comment, answeredAt: new Date() })
    .where(eq(schema.feedback.token, token))
    .returning({ id: schema.feedback.id });
  if (!changed.length) return { ok: false, error: "Invalid link." };
  after(() => feedbackReceived(changed[0].id));
  return { ok: true };
}

export async function setEmailOptOut(token: unknown, optOut: boolean): Promise<{ ok: boolean }> {
  if (!isToken(token)) return { ok: false };
  const changed = await db().update(schema.customers).set({ emailOptOut: Boolean(optOut) }).where(eq(schema.customers.token, token)).returning({ id: schema.customers.id });
  return { ok: changed.length > 0 };
}
