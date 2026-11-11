import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/db";
import { markMembershipActive, markOrderPaid } from "@/lib/payments";
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
      } else if (session.metadata?.kind === "membership") {
        const sub = typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);
        await markMembershipActive(id, sub);
      }
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object;
      const id = session.metadata?.id;
      if (id && session.metadata?.kind === "order") {
        await db()
          .update(schema.orders)
          .set({ status: "cancelled" })
          .where(and(eq(schema.orders.id, id), eq(schema.orders.status, "pending")));
      }
      break;
    }
    case "customer.subscription.deleted": {
      await db()
        .update(schema.memberships)
        .set({ status: "cancelled" })
        .where(eq(schema.memberships.stripeSubscriptionId, event.data.object.id));
      break;
    }
  }
  return NextResponse.json({ received: true });
}
