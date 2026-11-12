import "server-only";
import type { Customer, Membership, Order, Quote, Visit } from "@/db/schema";

/** Shapes used by both webhooks and the read-only API. Private link tokens are never included. */
const attr = (r: { source: string; medium: string; campaign: string }) => ({ source: r.source, medium: r.medium, campaign: r.campaign });

export const orderOut = (o: Order, items?: { name: string; priceCents: number; qty: number }[]) => ({
  id: o.id, status: o.status, paymentStatus: o.paymentStatus, customerId: o.customerId,
  name: o.name, email: o.email, phone: o.phone, address: o.address, city: o.city, zip: o.zip, notes: o.notes,
  day: o.day, startMin: o.startMin, endMin: o.endMin, subtotalCents: o.subtotalCents, paidOnlineCents: o.paymentStatus === "paid" ? o.dueNowCents : 0,
  ...(items ? { items: items.map((i) => ({ name: i.name, priceCents: i.priceCents, qty: i.qty })) } : {}),
  attribution: attr(o), createdAt: o.createdAt, completedAt: o.completedAt,
});

export const customerOut = (c: Customer) => ({
  id: c.id, name: c.name, email: c.email, phone: c.phone, address: c.address, city: c.city, zip: c.zip,
  smsConsent: c.smsConsent, emailOptOut: c.emailOptOut, attribution: attr(c), createdAt: c.createdAt, lastActivityAt: c.lastActivityAt,
});

export const visitOut = (v: Visit) => ({
  id: v.id, status: v.status, mode: v.mode, customerId: v.customerId, name: v.name, email: v.email, phone: v.phone, address: v.address, zip: v.zip,
  topic: v.topic, details: v.details, preferredDay: v.preferredDay, preferredTime: v.preferredTime, attribution: attr(v), createdAt: v.createdAt,
});

export const quoteOut = (q: Quote) => ({
  id: q.id, status: q.status, customerId: q.customerId, visitId: q.visitId, title: q.title, totalCents: q.totalCents,
  paymentStatus: q.paymentStatus, paidOnlineCents: q.paymentStatus === "paid" ? q.dueNowCents : 0, expiresDay: q.expiresDay,
  sentAt: q.sentAt, viewedAt: q.viewedAt, acceptedAt: q.acceptedAt, createdAt: q.createdAt,
});

export const membershipOut = (m: Membership) => ({
  id: m.id, status: m.status, customerId: m.customerId, planName: m.planName, priceCents: m.priceCents, interval: m.interval,
  name: m.name, email: m.email, phone: m.phone, address: m.address, city: m.city, zip: m.zip, generator: m.generator,
  attribution: attr(m), createdAt: m.createdAt, cancelledAt: m.cancelledAt,
});
