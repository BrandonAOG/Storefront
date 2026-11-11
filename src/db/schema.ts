import { boolean, date, index, integer, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Single-row table (id = 1) holding business-wide settings. */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey(),
  businessName: text("business_name").notNull().default("Always On Generators"),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  /** Comma-separated ZIP codes. Empty = no service-area restriction. */
  serviceZips: text("service_zips").notNull().default(""),
  /** Length of one arrival window, in minutes. */
  slotMinutes: integer("slot_minutes").notNull().default(120),
  /** How many jobs can share one arrival window (number of crews). */
  slotCapacity: integer("slot_capacity").notNull().default(1),
  /** Earliest bookable day, counted from today. */
  leadDays: integer("lead_days").notNull().default(1),
  /** How many days ahead customers can book. */
  horizonDays: integer("horizon_days").notNull().default(30),
  /** Share of the order charged at checkout. 100 = pay in full. */
  depositPercent: integer("deposit_percent").notNull().default(100),
});

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull().default("Service"),
  summary: text("summary").notNull().default(""),
  description: text("description").notNull().default(""),
  /** "fixed" = upfront price, bookable online. "quote" = needs a virtual visit first. */
  priceType: text("price_type").notNull().default("fixed"),
  priceCents: integer("price_cents").notNull().default(0),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  summary: text("summary").notNull().default(""),
  /** One feature per line. */
  features: text("features").notNull().default(""),
  priceCents: integer("price_cents").notNull(),
  /** "month" or "year" */
  interval: text("interval").notNull().default("year"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Opening hours, one row per weekday (0 = Sunday). Minutes from midnight. */
export const hours = pgTable("hours", {
  weekday: integer("weekday").primaryKey(),
  open: boolean("open").notNull().default(true),
  startMin: integer("start_min").notNull().default(480),
  endMin: integer("end_min").notNull().default(960),
});

export const blackouts = pgTable("blackouts", {
  day: date("day", { mode: "string" }).primaryKey(),
  note: text("note").notNull().default(""),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Unguessable token used in the customer's confirmation link. */
    token: text("token").notNull().unique(),
    /** pending (awaiting payment) | confirmed | completed | cancelled */
    status: text("status").notNull().default("pending"),
    /** unpaid | paid | refunded */
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    address: text("address").notNull(),
    city: text("city").notNull(),
    zip: text("zip").notNull(),
    notes: text("notes").notNull().default(""),
    day: date("day", { mode: "string" }).notNull(),
    startMin: integer("start_min").notNull(),
    endMin: integer("end_min").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    dueNowCents: integer("due_now_cents").notNull(),
    stripeSessionId: text("stripe_session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("orders_day_idx").on(t.day, t.startMin)],
);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  serviceId: integer("service_id"),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  qty: integer("qty").notNull().default(1),
});

export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  planId: integer("plan_id"),
  planName: text("plan_name").notNull(),
  priceCents: integer("price_cents").notNull(),
  interval: text("interval").notNull(),
  /** pending | active | cancelled */
  status: text("status").notNull().default("pending"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  zip: text("zip").notNull(),
  generator: text("generator").notNull().default(""),
  stripeSessionId: text("stripe_session_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const visits = pgTable("visits", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** new | scheduled | done | closed */
  status: text("status").notNull().default("new"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull().default(""),
  zip: text("zip").notNull().default(""),
  topic: text("topic").notNull().default(""),
  details: text("details").notNull().default(""),
  preferredDay: text("preferred_day").notNull().default(""),
  preferredTime: text("preferred_time").notNull().default(""),
  meetingUrl: text("meeting_url").notNull().default(""),
  adminNotes: text("admin_notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Settings = typeof settings.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Visit = typeof visits.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
