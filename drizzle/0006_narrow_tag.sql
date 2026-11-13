ALTER TABLE "settings" ADD COLUMN "call_needed" text DEFAULT 'A charged phone, or a charger nearby. Video uses more battery than normal.
Good signal or Wi-Fi where your equipment is. Garages and the side of the house are often weak spots.
A clear path to your electrical panel, your gas or propane meter, and where the generator would go. Unlock any gates.' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "call_recommended" text DEFAULT 'A tape measure.
A sheet of printer paper and some tape. We''ll ask you to tape it flat where we need to measure.
Your property survey or site plan, if you have one. You can add a photo of it on your visit page before the call.
A flashlight, if your electrical panel is in a dark spot.
A second person to hold the phone, if that''s easier.
Know whether you have natural gas or propane, and where the meter or tank is.' NOT NULL;--> statement-breakpoint
-- Saved copies of the two call emails that still hold the old built-in wording go back to the built-in template, which now uses your editable checklist.
UPDATE "automations" SET "body" = '' WHERE "key" = 'visit_scheduled' AND "body" = 'Hi {{name}},

Your video call with {{business}} is scheduled for {{when}}.

At that time, open this page on your phone and tap Join video call:
{{link}}

Before the call, please have ready:
- A sheet of printer paper and some tape (we use it to measure from the video)
- A tape measure or ruler, if you have one
- A charged phone (video uses more battery than normal)

Need a different time? Call {{phone}}.';--> statement-breakpoint
UPDATE "automations" SET "body" = '' WHERE "key" = 'visit_reminder' AND "body" = 'Hi {{name}},

A reminder that your video call with {{business}} is today at {{time}}.

Open this page on your phone and tap Join video call:
{{link}}

Please have a sheet of printer paper, some tape and a tape measure or ruler handy.';
