import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmtAppointment, fmtDay, fmtWindow, money } from "./format";
import { alertOwner, sendAutomation } from "./messaging";
import { membershipOut, orderOut, quoteOut, visitOut } from "./serialize";
import { getSettings } from "./settings";
import { appUrl } from "./stripe";
import { emit } from "./webhooks";

/**
 * What happens after something changes: customer messages, an alert to the
 * business, and webhooks. Each function is safe to call twice for the same
 * record (messages are de-duplicated) and never throws into the caller.
 */
const guard = (name: string, fn: () => Promise<void>) =>
  fn().catch((err) => console.error(`${name} failed:`, err instanceof Error ? err.message : "unknown error"));

const customerById = async (id: string | null) => (id ? (await db().select().from(schema.customers).where(eq(schema.customers.id, id)))[0] : undefined);

export const orderConfirmed = (orderId: string) =>
  guard("orderConfirmed", async () => {
    const [o] = await db().select().from(schema.orders).where(eq(schema.orders.id, orderId));
    if (!o || o.status !== "confirmed") return;
    const [items, settings, customer] = await Promise.all([
      db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id)),
      getSettings(),
      customerById(o.customerId),
    ]);
    const itemText = items.map((i) => `${i.qty} x ${i.name}`).join(", ");
    if (customer) {
      await sendAutomation({
        key: "order_confirmation", refId: o.id, customer, settings,
        vars: { day: fmtDay(o.day, true), window: fmtWindow(o.startMin, o.endMin), address: `${o.address}, ${o.city} ${o.zip}`, items: itemText, total: o.subtotalCents > 0 ? money(o.subtotalCents) : "confirmed with you before work begins", link: `${appUrl()}/order/${o.token}` },
      });
    }
    await alertOwner(settings, `order:${o.id}`, `New booking: ${fmtDay(o.day)} ${fmtWindow(o.startMin, o.endMin)}`, `${o.name} booked ${itemText}${o.subtotalCents > 0 ? ` (${money(o.subtotalCents)})` : ""}.\n\n${appUrl()}/admin/orders/${o.id}`);
    await emit("order.confirmed", orderOut(o, items));
  });

export const orderChanged = (orderId: string, event: "order.completed" | "order.cancelled") =>
  guard("orderChanged", async () => {
    const [o] = await db().select().from(schema.orders).where(eq(schema.orders.id, orderId));
    if (o) await emit(event, orderOut(o));
  });

export const visitCreated = (visitId: string) =>
  guard("visitCreated", async () => {
    const [v] = await db().select().from(schema.visits).where(eq(schema.visits.id, visitId));
    if (!v) return;
    const [settings, customer] = await Promise.all([getSettings(), customerById(v.customerId)]);
    if (customer) await sendAutomation({ key: "visit_received", refId: v.id, customer, settings, vars: { link: `${appUrl()}/visit/${v.token}` } });
    await alertOwner(settings, `visit:${v.id}`, `New virtual visit request${v.topic ? `: ${v.topic}` : ""}`, `${v.name} asked for a ${v.mode === "async" ? "video review" : "live virtual visit"}.\n\n${appUrl()}/admin/visits/${v.id}`);
    await emit("visit.created", visitOut(v));
  });

export const visitScheduled = (visitId: string) =>
  guard("visitScheduled", async () => {
    const [v] = await db().select().from(schema.visits).where(eq(schema.visits.id, visitId));
    if (!v?.scheduledAt || !v.token) return;
    const [settings, customer] = await Promise.all([getSettings(), customerById(v.customerId)]);
    // refId includes the time, so changing the time sends a fresh message.
    if (customer) await sendAutomation({ key: "visit_scheduled", refId: `${v.id}:${v.scheduledAt.getTime()}`, customer, settings, vars: { when: fmtAppointment(v.scheduledAt), link: `${appUrl()}/visit/${v.token}` } });
  });

export const membershipChanged = (id: string, event: "membership.created" | "membership.active" | "membership.cancelled") =>
  guard("membershipChanged", async () => {
    const [m] = await db().select().from(schema.memberships).where(eq(schema.memberships.id, id));
    if (!m) return;
    const [settings, customer] = await Promise.all([getSettings(), customerById(m.customerId)]);
    if (event !== "membership.cancelled") {
      if (customer) await sendAutomation({ key: "membership_welcome", refId: m.id, customer, settings, vars: { plan: m.planName, link: `${appUrl()}/plans/thanks/${m.token}` } });
      await alertOwner(settings, `membership:${m.id}`, `New plan sign-up: ${m.planName}`, `${m.name} asked for the ${m.planName} plan${m.priceCents > 0 ? ` (${money(m.priceCents)} / ${m.interval})` : ""}.\n\n${appUrl()}/admin/memberships`);
    }
    await emit(event, membershipOut(m));
  });

export const quoteSent = (quoteId: string) =>
  guard("quoteSent", async () => {
    const [q] = await db().select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
    if (!q) return;
    const [settings, customer] = await Promise.all([getSettings(), customerById(q.customerId)]);
    // refId includes the send time so re-sending an edited estimate goes out again.
    if (customer) await sendAutomation({ key: "quote_sent", refId: `${q.id}:${q.sentAt?.getTime() ?? 0}`, customer, settings, vars: { title: q.title, link: `${appUrl()}/quote/${q.token}` } });
    await emit("quote.sent", quoteOut(q));
  });

export const quoteAccepted = (quoteId: string) =>
  guard("quoteAccepted", async () => {
    const [q] = await db().select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
    if (!q || q.status !== "accepted") return;
    const [settings, customer] = await Promise.all([getSettings(), customerById(q.customerId)]);
    await alertOwner(settings, `quote:${q.id}`, `Estimate accepted: ${q.title}`, `${customer?.name ?? "A customer"} accepted "${q.title}" for ${money(q.totalCents)}.\n\n${appUrl()}/admin/quotes/${q.id}`);
    await emit("quote.accepted", quoteOut(q));
  });

export const feedbackReceived = (feedbackId: string) =>
  guard("feedbackReceived", async () => {
    const [f] = await db().select().from(schema.feedback).where(eq(schema.feedback.id, feedbackId));
    if (!f || f.score === null) return;
    const settings = await getSettings();
    if (f.score <= 6) await alertOwner(settings, `feedback:${f.id}`, `Low feedback score: ${f.score}/10`, `A customer scored their visit ${f.score}/10.\n\n${appUrl()}/admin/feedback`);
    await emit("feedback.received", { id: f.id, orderId: f.orderId, customerId: f.customerId, score: f.score, comment: f.comment, answeredAt: f.answeredAt });
  });
