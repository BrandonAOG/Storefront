"use server";

import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings, zipServed } from "@/lib/settings";
import { countOccupied, findSlot } from "@/lib/slots";
import { rateLimit } from "@/lib/ratelimit";
import { appUrl, stripe, stripeEnabled } from "@/lib/stripe";
import { firstError, membershipSchema, orderSchema, visitSchema } from "@/lib/validation";

export type ActionResult = { ok: true; url: string } | { ok: false; error: string };

const BUSY = "Too many requests. Please wait a minute and try again.";
const newToken = () => randomBytes(24).toString("hex");

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
  const byId = new Map(found.map((x) => [x.id, x]));
  const qtyById = new Map<number, number>();
  for (const i of data.items) qtyById.set(i.serviceId, Math.min(10, (qtyById.get(i.serviceId) ?? 0) + i.qty));
  const lines = [...qtyById].map(([id, qty]) => ({ service: byId.get(id)!, qty }));
  const subtotalCents = lines.reduce((sum, l) => sum + l.service.priceCents * l.qty, 0);
  const pct = Math.min(100, Math.max(0, s.depositPercent));
  const online = stripeEnabled() && pct > 0 && subtotalCents > 0;
  const dueNowCents = online ? Math.round((subtotalCents * pct) / 100) : 0;

  const slot = await findSlot(s, data.day, data.startMin);
  if (!slot) return { ok: false, error: "That time is no longer offered. Please pick another." };

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
      })
      .returning();
    await tx.insert(schema.orderItems).values(
      lines.map((l) => ({ orderId: row.id, serviceId: l.service.id, name: l.service.name, priceCents: l.service.priceCents, qty: l.qty })),
    );
    return row;
  });
  if (!order) return { ok: false, error: "That time was just taken. Please pick another." };

  if (!online) return { ok: true, url: `/order/${token}` };

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
    })
    .returning();

  if (!stripeEnabled()) return { ok: true, url: `/plans/thanks/${token}` };

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

export async function createVisit(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await rateLimit("visit", 5, 600))) return { ok: false, error: BUSY };
  const parsed = visitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { website, ...data } = parsed.data;
  if (website) return { ok: false, error: "Could not submit the form." };
  await db().insert(schema.visits).values(data);
  return { ok: true };
}
