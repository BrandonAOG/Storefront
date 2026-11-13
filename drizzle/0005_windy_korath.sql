ALTER TABLE "visits" ADD COLUMN "host_id" text;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "host_name" text;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "host_seen_at" timestamp with time zone;