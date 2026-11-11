import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { stripe, stripeEnabled } from "./stripe";

/** Mark an order paid + confirmed. Safe to call more than once. */
export async function markOrderPaid(orderId: string) {
  await db()
    .update(schema.orders)
    .set({ paymentStatus: "paid", status: "confirmed" })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.status, "pending")));
}

export async function markMembershipActive(id: string, subscriptionId: string | null) {
  await db()
    .update(schema.memberships)
    .set({ status: "active", stripeSubscriptionId: subscriptionId })
    .where(and(eq(schema.memberships.id, id), eq(schema.memberships.status, "pending")));
}

/**
 * Fallback for a late or missed webhook: when the customer lands back on the
 * confirmation page, ask Stripe directly whether the checkout was paid.
 */
export async function syncOrderPayment(order: { id: string; status: string; stripeSessionId: string | null }) {
  if (order.status !== "pending" || !order.stripeSessionId || !stripeEnabled()) return false;
  const session = await stripe().checkout.sessions.retrieve(order.stripeSessionId);
  if (session.payment_status !== "paid" || session.metadata?.id !== order.id) return false;
  await markOrderPaid(order.id);
  return true;
}

export async function syncMembershipPayment(m: { id: string; status: string; stripeSessionId: string | null }) {
  if (m.status !== "pending" || !m.stripeSessionId || !stripeEnabled()) return false;
  const session = await stripe().checkout.sessions.retrieve(m.stripeSessionId);
  if (session.status !== "complete" || session.metadata?.id !== m.id) return false;
  const sub = typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);
  await markMembershipActive(m.id, sub);
  return true;
}
