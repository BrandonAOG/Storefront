CREATE TABLE "visit_signals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"visit_id" uuid NOT NULL,
	"from_role" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visit_media" ADD COLUMN "kind" text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "visit_media" ADD COLUMN "meta" jsonb;--> statement-breakpoint
ALTER TABLE "visit_signals" ADD CONSTRAINT "visit_signals_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visit_signals_idx" ON "visit_signals" USING btree ("visit_id","id");