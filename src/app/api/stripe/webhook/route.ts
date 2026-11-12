import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/db";
import { membershipChanged, orderChanged } from "@/lib/notify";
import { markMembershipActive, markOrderPaid, markQuotePaid } from "@/lib/payments";
import { stripe, stripeEnabled } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!stripeEnabled() || !secret || !signature) return new NextResponse("Not configured", { status: 400 });

  let event: Stripe.Event;
  try {
    // The signature check needs the raw, unparsed body.
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      const id = session.metadata?.id;
      if (!id) break;
      if (session.metadata?.kind === "order" && session.payment_status === "paid") {
        await markOrderPaid(id);
      } else if (session.metadata?.kind === "quote" && session.payment_status === "paid") {
        await markQuotePaid(id);
      } else if (session.metadata?.kind === "membership") {
        const idOf = (v: string | { id: string } | null) => (typeof v === "string" ? v : (v?.id ?? null));
        await markMembershipActive(id, idOf(session.subscription), idOf(session.customer));
      }
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object;
      const id = session.metadata?.id;
      if (id && session.metadata?.kind === "order") {
        const changed = await db()
          .update(schema.orders)
          .set({ status: "cancelled" })
          .where(and(eq(schema.orders.id, id), eq(schema.orders.status, "pending")))
          .returning({ id: schema.orders.id });
        if (changed.length) await orderChanged(id, "order.cancelled");
      }
      break;
    }
    case "customer.subscription.deleted": {
      const changed = await db()
        .update(schema.memberships)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(eq(schema.memberships.stripeSubscriptionId, event.data.object.id))
        .returning({ id: schema.memberships.id });
      for (const m of changed) await membershipChanged(m.id, "membership.cancelled");
      break;
    }
  }
  return NextResponse.json({ received: true });
}
