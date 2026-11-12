import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { membershipChanged, orderConfirmed, quoteAccepted } from "./notify";
import { stripe, stripeEnabled } from "./stripe";

/** Mark an order paid + confirmed. Safe to call more than once; notifies only the first time. */
export async function markOrderPaid(orderId: string) {
  const changed = await db()
    .update(schema.orders)
    .set({ paymentStatus: "paid", status: "confirmed" })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.status, "pending")))
    .returning({ id: schema.orders.id });
  if (changed.length) await orderConfirmed(orderId);
  return changed.length > 0;
}

export async function markMembershipActive(id: string, subscriptionId: string | null, stripeCustomerId: string | null) {
  const changed = await db()
    .update(schema.memberships)
    .set({ status: "active", stripeSubscriptionId: subscriptionId, stripeCustomerId })
    .where(and(eq(schema.memberships.id, id), eq(schema.memberships.status, "pending")))
    .returning({ id: schema.memberships.id });
  if (changed.length) await membershipChanged(id, "membership.active");
  return changed.length > 0;
}

export async function markQuotePaid(quoteId: string) {
  const changed = await db()
    .update(schema.quotes)
    .set({ paymentStatus: "paid", status: "accepted", acceptedAt: new Date() })
    .where(and(eq(schema.quotes.id, quoteId), eq(schema.quotes.paymentStatus, "unpaid")))
    .returning({ id: schema.quotes.id });
  if (changed.length) await quoteAccepted(quoteId);
  return changed.length > 0;
}

const idOf = (v: string | { id: string } | null) => (typeof v === "string" ? v : (v?.id ?? null));

/**
 * Fallback for a late or missed webhook: when the customer lands back on a
 * confirmation page, ask Stripe directly whether the checkout was paid.
 */
export async function syncOrderPayment(order: { id: string; status: string; stripeSessionId: string | null }) {
  if (order.status !== "pending" || !order.stripeSessionId || !stripeEnabled()) return false;
  const session = await stripe().checkout.sessions.retrieve(order.stripeSessionId);
  if (session.payment_status !== "paid" || session.metadata?.id !== order.id) return false;
  return markOrderPaid(order.id);
}

export async function syncMembershipPayment(m: { id: string; status: string; stripeSessionId: string | null }) {
  if (m.status !== "pending" || !m.stripeSessionId || !stripeEnabled()) return false;
  const session = await stripe().checkout.sessions.retrieve(m.stripeSessionId);
  if (session.status !== "complete" || session.metadata?.id !== m.id) return false;
  return markMembershipActive(m.id, idOf(session.subscription), idOf(session.customer));
}

export async function syncQuotePayment(q: { id: string; paymentStatus: string; stripeSessionId: string | null }) {
  if (q.paymentStatus !== "unpaid" || !q.stripeSessionId || !stripeEnabled()) return false;
  const session = await stripe().checkout.sessions.retrieve(q.stripeSessionId);
  if (session.payment_status !== "paid" || session.metadata?.id !== q.id) return false;
  return markQuotePaid(q.id);
}
