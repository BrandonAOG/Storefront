CREATE TABLE "blackouts" (
	"day" date PRIMARY KEY NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hours" (
	"weekday" integer PRIMARY KEY NOT NULL,
	"open" boolean DEFAULT true NOT NULL,
	"start_min" integer DEFAULT 480 NOT NULL,
	"end_min" integer DEFAULT 960 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"plan_id" integer,
	"plan_name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"interval" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"zip" text NOT NULL,
	"generator" text DEFAULT '' NOT NULL,
	"stripe_session_id" text,
	"stripe_subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"service_id" integer,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"zip" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"day" date NOT NULL,
	"start_min" integer NOT NULL,
	"end_min" integer NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"due_now_cents" integer NOT NULL,
	"stripe_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"features" text DEFAULT '' NOT NULL,
	"price_cents" integer NOT NULL,
	"interval" text DEFAULT 'year' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'Service' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_type" text DEFAULT 'fixed' NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "services_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"business_name" text DEFAULT 'Always On Generators' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"service_zips" text DEFAULT '' NOT NULL,
	"slot_minutes" integer DEFAULT 120 NOT NULL,
	"slot_capacity" integer DEFAULT 1 NOT NULL,
	"lead_days" integer DEFAULT 1 NOT NULL,
	"horizon_days" integer DEFAULT 30 NOT NULL,
	"deposit_percent" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"zip" text DEFAULT '' NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"preferred_day" text DEFAULT '' NOT NULL,
	"preferred_time" text DEFAULT '' NOT NULL,
	"meeting_url" text DEFAULT '' NOT NULL,
	"admin_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_day_idx" ON "orders" USING btree ("day","start_min");