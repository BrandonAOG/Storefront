import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { getAvailability } from "@/lib/slots";

export const dynamic = "force-dynamic";

/** Public: open arrival windows. Contains no customer data. */
export async function GET() {
  const days = await getAvailability(await getSettings());
  return NextResponse.json({ days }, { headers: { "Cache-Control": "no-store" } });
}
