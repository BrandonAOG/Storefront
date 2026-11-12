ALTER TABLE "visits" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "customer_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "rep_seen_at" timestamp with time zone;