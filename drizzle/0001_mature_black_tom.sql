CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"sms" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"zip" text DEFAULT '' NOT NULL,
	"sms_consent" boolean DEFAULT false NOT NULL,
	"email_opt_out" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"visitor_id" text,
	"source" text DEFAULT 'direct' NOT NULL,
	"medium" text DEFAULT '' NOT NULL,
	"campaign" text DEFAULT '' NOT NULL,
	"variant" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_email_unique" UNIQUE("email"),
	CONSTRAINT "customers_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"visitor_id" text NOT NULL,
	"type" text NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'direct' NOT NULL,
	"medium" text DEFAULT '' NOT NULL,
	"campaign" text DEFAULT '' NOT NULL,
	"variant" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid,
	"score" integer,
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	CONSTRAINT "feedback_token_unique" UNIQUE("token"),
	CONSTRAINT "feedback_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"channel" text NOT NULL,
	"to_addr" text NOT NULL,
	"automation_key" text NOT NULL,
	"ref_id" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_cents" integer NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"optional" boolean DEFAULT false NOT NULL,
	"selected" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"visit_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text DEFAULT 'Your estimate' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"deposit_percent" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"due_now_cents" integer DEFAULT 0 NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"stripe_session_id" text,
	"expires_day" date,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "visit_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"url" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"content_type" text DEFAULT '' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"media_id" uuid,
	"at_seconds" integer,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"response_code" integer,
	"error" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text DEFAULT '*' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "visitor_id" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "source" text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "medium" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "campaign" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "variant" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "visitor_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "source" text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "medium" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "campaign" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "variant" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "image_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "includes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "zips" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "lead_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "notify_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "review_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "mailing_address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "hero_headline" text DEFAULT 'Generator service, priced upfront. Book it in two minutes.' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "hero_sub" text DEFAULT 'See the price, pick an arrival window and check out. No phone tag, no waiting for a callback.' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ab_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "hero_headline_b" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "hero_sub_b" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "mode" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "visitor_id" text;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "source" text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "medium" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "campaign" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "variant" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_media" ADD CONSTRAINT "visit_media_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_time_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "events_visitor_idx" ON "events" USING btree ("visitor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_once_idx" ON "messages" USING btree ("automation_key","ref_id","channel");--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_token_unique" UNIQUE("token");