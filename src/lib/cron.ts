import { callChecklistText } from "./checklist";
import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadAutomations } from "./automations";
import { fmtDay, fmtWindow, TIME_ZONE } from "./format";
import { purgeOldSignals } from "./call";
import { retryMessages, sendAutomation } from "./messaging";
import { getSettings } from "./settings";
import { addDays, todayLocal } from "./slots";
import { appUrl } from "./stripe";
import { retryWebhooks } from "./webhooks";

const o = schema.orders;
const c = schema.customers;
const daysAgo = (col: unknown, from: number, to: number) => sql`${col} <= now() - make_interval(days => ${from}) and ${col} > now() - make_interval(days => ${to})`;

/**
 * The daily job: time-based messages plus housekeeping. Every message is keyed
 * so running this twice in a day sends nothing twice.
 */
export async function runDailyJobs() {
  const [settings, autos] = await Promise.all([getSettings(), loadAutomations()]);
  const on = (key: string) => (autos.get(key)?.enabled ? autos.get(key)! : null);
  const done: Record<string, number> = {};
  const base = appUrl();

  // Housekeeping first, so reminders never go to stale bookings.
  done.staleCheckouts = (await db().update(o).set({ status: "cancelled" }).where(and(eq(o.status, "pending"), lt(o.createdAt, sql`now() - interval '2 hours'`))).returning({ id: o.id })).length;
  done.expiredQuotes = (await db().update(schema.quotes).set({ status: "expired" }).where(and(eq(schema.quotes.status, "sent"), lt(schema.quotes.expiresDay, todayLocal()))).returning({ id: schema.quotes.id })).length;

  await purgeOldSignals();

  let a = on("appointment_reminder");
  if (a) {
    const rows = await db().select({ order: o, customer: c }).from(o).innerJoin(c, eq(c.id, o.customerId)).where(and(eq(o.status, "confirmed"), eq(o.day, addDays(todayLocal(), Math.max(0, a.delayDays)))));
    for (const r of rows) {
      await sendAutomation({ key: a.key, refId: r.order.id, customer: r.customer, settings, vars: { day: fmtDay(r.order.day, true), window: fmtWindow(r.order.startMin, r.order.endMin), address: `${r.order.address}, ${r.order.city} ${r.order.zip}`, link: `${base}/order/${r.order.token}` } });
    }
    done.reminders = rows.length;
  }

  a = on("visit_reminder");
  if (a) {
    const v = schema.visits;
    const rows = await db()
      .select({ visit: v, customer: c })
      .from(v)
      .innerJoin(c, eq(c.id, v.customerId))
      .where(and(eq(v.status, "scheduled"), isNotNull(v.scheduledAt), isNotNull(v.token), sql`(${v.scheduledAt} at time zone ${TIME_ZONE})::date = (now() at time zone ${TIME_ZONE})::date`, sql`${v.scheduledAt} > now()`));
    for (const r of rows) {
      const time = r.visit.scheduledAt!.toLocaleTimeString("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
      await sendAutomation({ key: a.key, refId: `${r.visit.id}:${r.visit.scheduledAt!.getTime()}`, customer: r.customer, settings, vars: { checklist: callChecklistText(settings), time, link: `${base}/visit/${r.visit.token}` } });
    }
    done.visitReminders = rows.length;
  }

  a = on("review_request");
  if (a) {
    const rows = await db()
      .select({ order: o, customer: c })
      .from(o)
      .innerJoin(c, eq(c.id, o.customerId))
      .leftJoin(schema.feedback, eq(schema.feedback.orderId, o.id))
      .where(and(eq(o.status, "completed"), isNotNull(o.completedAt), isNull(schema.feedback.id), daysAgo(o.completedAt, a.delayDays, a.delayDays + 14)));
    for (const r of rows) {
      const token = randomBytes(24).toString("hex");
      const made = await db().insert(schema.feedback).values({ token, orderId: r.order.id, customerId: r.customer.id }).onConflictDoNothing().returning();
      if (made.length) await sendAutomation({ key: a.key, refId: r.order.id, customer: r.customer, settings, vars: { link: `${base}/feedback/${token}` } });
    }
    done.reviewRequests = rows.length;
  }

  a = on("rebook_reminder");
  if (a) {
    // Customers whose most recent completed job falls in the window and who have nothing booked since.
    const rows = await db()
      .select({ customer: c, lastOrderId: sql<string>`(array_agg(${o.id} order by ${o.completedAt} desc))[1]` })
      .from(c)
      .innerJoin(o, and(eq(o.customerId, c.id), eq(o.status, "completed"), isNotNull(o.completedAt)))
      .where(sql`not exists (select 1 from orders n where n.customer_id = ${c.id} and n.status in ('pending','confirmed'))`)
      .groupBy(c.id)
      .having(daysAgo(sql`max(${o.completedAt})`, a.delayDays, a.delayDays + 14));
    for (const r of rows) await sendAutomation({ key: a.key, refId: r.lastOrderId, customer: r.customer, settings, vars: { link: `${base}/#services` } });
    done.rebookReminders = rows.length;
  }

  a = on("abandoned_checkout");
  if (a) {
    const rows = await db()
      .select({ order: o, customer: c })
      .from(o)
      .innerJoin(c, eq(c.id, o.customerId))
      .where(and(eq(o.status, "cancelled"), eq(o.paymentStatus, "unpaid"), isNotNull(o.stripeSessionId), daysAgo(o.createdAt, a.delayDays, a.delayDays + 3), sql`not exists (select 1 from orders n where n.customer_id = ${c.id} and n.created_at > ${o.createdAt} and n.status <> 'cancelled')`));
    for (const r of rows) await sendAutomation({ key: a.key, refId: r.order.id, customer: r.customer, settings, vars: { link: `${base}/book` } });
    done.abandonedCheckouts = rows.length;
  }

  a = on("winback");
  if (a) {
    const rows = await db().select().from(c).where(daysAgo(c.lastActivityAt, a.delayDays, a.delayDays + 30));
    for (const customer of rows) await sendAutomation({ key: a.key, refId: `${customer.id}:${customer.lastActivityAt.toISOString().slice(0, 10)}`, customer, settings, vars: { link: `${base}/#services` } });
    done.winbacks = rows.length;
  }

  a = on("loyalty_thanks");
  if (a) {
    const rows = await db()
      .select({ customer: c })
      .from(c)
      .innerJoin(o, and(eq(o.customerId, c.id), eq(o.status, "completed")))
      .groupBy(c.id)
      .having(sql`count(*) >= ${Math.max(1, a.delayDays)}`);
    for (const r of rows) await sendAutomation({ key: a.key, refId: r.customer.id, customer: r.customer, settings, vars: { link: `${base}/plans` } });
    done.loyalty = rows.length;
  }

  done.messageRetries = await retryMessages();
  done.webhookRetries = await retryWebhooks();
  return done;
}
