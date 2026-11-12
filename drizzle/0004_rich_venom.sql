ALTER TABLE "visits" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "loc_accuracy" integer;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "loc_at" timestamp with time zone;