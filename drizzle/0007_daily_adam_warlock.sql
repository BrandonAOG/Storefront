ALTER TABLE "settings" ALTER COLUMN "call_recommended" SET DEFAULT 'A tape measure.
Our 3 measuring sheets, printed and taped up (print them from your visit page). No printer? A plain sheet of printer paper and some tape works too.
Your property survey or site plan, if you have one. You can add a photo of it on your visit page before the call.
A flashlight, if your electrical panel is in a dark spot.
A second person to hold the phone, if that''s easier.
Know whether you have natural gas or propane, and where the meter or tank is.';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ref_presets" text DEFAULT 'Letter paper | 8.5 x 11
AOG measuring sheet, marker frame | 6.5 x 9
Outlet or switch cover plate | 2.75 x 4.5
Credit card | 3.37 x 2.125
Dollar bill | 6.14 x 2.61
Standard brick face | 7.625 x 2.25
Concrete block face | 15.625 x 7.625
Standard door | 36 x 80
~Electric meter cover, across | 6.375
~Indoor panel cover, width | 14.5' NOT NULL;--> statement-breakpoint
-- The checklist now points customers to the printable measuring sheets (only where the old built-in line is still there).
UPDATE "settings" SET "call_recommended" = replace("call_recommended", 'A sheet of printer paper and some tape. We''ll ask you to tape it flat where we need to measure.', 'Our 3 measuring sheets, printed and taped up (print them from your visit page). No printer? A plain sheet of printer paper and some tape works too.');
