import { bigserial, boolean, date, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** Where a visitor came from (first touch), copied onto whatever they create. */
const attribution = {
  visitorId: text("visitor_id"),
  source: text("source").notNull().default("direct"),
  medium: text("medium").notNull().default(""),
  campaign: text("campaign").notNull().default(""),
  variant: text("variant").notNull().default(""),
};

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
  /** Where new-booking and new-request alerts are emailed. */
  notifyEmail: text("notify_email").notNull().default(""),
  /** Public review page (Google, Facebook…) offered to happy customers. */
  reviewUrl: text("review_url").notNull().default(""),
  /** Postal address shown in the footer of marketing emails (required by CAN-SPAM). */
  mailingAddress: text("mailing_address").notNull().default(""),
  heroHeadline: text("hero_headline").notNull().default("Generator service, priced upfront. Book it in two minutes."),
  heroSub: text("hero_sub").notNull().default("See the price, pick an arrival window and check out. No phone tag, no waiting for a callback."),
  /** A/B test: when on, half of visitors see the B headline. */
  abEnabled: boolean("ab_enabled").notNull().default(false),
  heroHeadlineB: text("hero_headline_b").notNull().default(""),
  heroSubB: text("hero_sub_b").notNull().default(""),
});

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  /** Used in unsubscribe links. */
  token: text("token").notNull().unique(),
  name: text("name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  city: text("city").notNull().default(""),
  zip: text("zip").notNull().default(""),
  /** Customer ticked "text me updates". */
  smsConsent: boolean("sms_consent").notNull().default(false),
  /** Customer unsubscribed from marketing email. */
  emailOptOut: boolean("email_opt_out").notNull().default(false),
  notes: text("notes").notNull().default(""),
  ...attribution,
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
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
  imageUrl: text("image_url").notNull().default(""),
  /** "What's included" checklist, one item per line. */
  includes: text("includes").notNull().default(""),
  /** Comma-separated ZIPs this service is limited to. Empty = whole service area. */
  zips: text("zips").notNull().default(""),
  /** Extra notice this service needs, in days (0 = use the general rule). */
  leadDays: integer("lead_days").notNull().default(0),
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
    customerId: uuid("customer_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...attribution,
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
  stripeCustomerId: text("stripe_customer_id"),
  customerId: uuid("customer_id"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  ...attribution,
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
  /** Private link the customer uses to add photos and videos. */
  token: text("token").unique(),
  /** live = scheduled call, async = customer sends a video for review. */
  mode: text("mode").notNull().default("live"),
  /** The agreed time of the video call. */
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  /** Last time each side had the call page open; used to show "customer is waiting". */
  customerSeenAt: timestamp("customer_seen_at", { withTimezone: true }),
  repSeenAt: timestamp("rep_seen_at", { withTimezone: true }),
  customerId: uuid("customer_id"),
  ...attribution,
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const visitMedia = pgTable("visit_media", {
  id: uuid("id").primaryKey().defaultRandom(),
  visitId: uuid("visit_id").notNull().references(() => visits.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  name: text("name").notNull().default(""),
  contentType: text("content_type").notNull().default(""),
  size: integer("size").notNull().default(0),
  /** upload = sent by the customer, snapshot = captured by you during a video call. */
  kind: text("kind").notNull().default("upload"),
  /** Measurements drawn on an image: scale reference plus measured lines. */
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Short-lived messages the two sides of a video call exchange to connect
 * directly to each other (WebRTC signaling). No audio or video is stored here.
 */
export const visitSignals = pgTable(
  "visit_signals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    visitId: uuid("visit_id").notNull().references(() => visits.id, { onDelete: "cascade" }),
    /** rep | customer */
    fromRole: text("from_role").notNull(),
    /** ready | offer | answer | ice | bye */
    kind: text("kind").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("visit_signals_idx").on(t.visitId, t.id)],
);

/** Reviewer notes on a visit; atSeconds pins a note to a moment in a video. */
export const visitNotes = pgTable("visit_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  visitId: uuid("visit_id").notNull().references(() => visits.id, { onDelete: "cascade" }),
  mediaId: uuid("media_id"),
  atSeconds: integer("at_seconds"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  customerId: uuid("customer_id").notNull(),
  visitId: uuid("visit_id"),
  /** draft | sent | accepted | declined | expired */
  status: text("status").notNull().default("draft"),
  title: text("title").notNull().default("Your estimate"),
  message: text("message").notNull().default(""),
  /** Share charged online when the customer accepts. 0 = no online payment. */
  depositPercent: integer("deposit_percent").notNull().default(0),
  /** Total of the items the customer accepted. */
  totalCents: integer("total_cents").notNull().default(0),
  dueNowCents: integer("due_now_cents").notNull().default(0),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  stripeSessionId: text("stripe_session_id"),
  expiresDay: date("expires_day", { mode: "string" }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quoteItems = pgTable("quote_items", {
  id: serial("id").primaryKey(),
  quoteId: uuid("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceCents: integer("price_cents").notNull(),
  qty: integer("qty").notNull().default(1),
  /** Optional add-on the customer can include or leave out. */
  optional: boolean("optional").notNull().default(false),
  selected: boolean("selected").notNull().default(true),
});

/** One row per message type. Missing rows fall back to the defaults in lib/automations. */
export const automations = pgTable("automations", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  delayDays: integer("delay_days").notNull().default(0),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  sms: text("sms").notNull().default(""),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id"),
    /** email | sms */
    channel: text("channel").notNull(),
    toAddr: text("to_addr").notNull(),
    automationKey: text("automation_key").notNull(),
    /** What this message is about (order id, quote id…). Stops duplicates. */
    refId: text("ref_id").notNull(),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull(),
    /** queued | sent | failed | skipped */
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("messages_once_idx").on(t.automationKey, t.refId, t.channel)],
);

export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  orderId: uuid("order_id").notNull().unique(),
  customerId: uuid("customer_id"),
  /** 0–10, null until answered. */
  score: integer("score"),
  comment: text("comment").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
});

/** Anonymous storefront activity used for the funnel. Holds no personal details. */
export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    visitorId: text("visitor_id").notNull(),
    /** view | add_to_cart | checkout_start | order | visit | membership */
    type: text("type").notNull(),
    path: text("path").notNull().default(""),
    source: text("source").notNull().default("direct"),
    medium: text("medium").notNull().default(""),
    campaign: text("campaign").notNull().default(""),
    variant: text("variant").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_time_idx").on(t.createdAt), index("events_visitor_idx").on(t.visitorId)],
);

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  /** Used to sign each delivery so the receiver can verify it came from here. */
  secret: text("secret").notNull(),
  /** Comma-separated event names, or "*" for all. */
  events: text("events").notNull().default("*"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  webhookId: uuid("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  payload: jsonb("payload").notNull(),
  /** queued | sent | failed */
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  responseCode: integer("response_code"),
  error: text("error").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** First characters of the key, shown so you can tell keys apart. */
  prefix: text("prefix").notNull(),
  /** SHA-256 of the key. The key itself is never stored. */
  hash: text("hash").notNull().unique(),
  revoked: boolean("revoked").notNull().default(false),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Settings = typeof settings.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Visit = typeof visits.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type QuoteItem = typeof quoteItems.$inferSelect;
export type Message = typeof messages.$inferSelect;
