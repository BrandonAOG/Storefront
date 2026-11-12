import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings } from "@/lib/settings";
import { getAvailability } from "@/lib/slots";

export const dynamic = "force-dynamic";

/** Public: open arrival windows for the services in the cart. Contains no customer data. */
export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("services") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 20);
  // A service that needs extra notice pushes the first bookable day out.
  const lead = ids.length ? Math.max(0, ...(await db().select({ d: schema.services.leadDays }).from(schema.services).where(inArray(schema.services.id, ids))).map((r) => r.d)) : 0;
  const days = await getAvailability(await getSettings(), lead);
  return NextResponse.json({ days }, { headers: { "Cache-Control": "no-store" } });
}
