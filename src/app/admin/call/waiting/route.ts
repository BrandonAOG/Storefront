import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { callDueSoon, waitingCustomers } from "@/lib/call";

export const dynamic = "force-dynamic";

/** Tells an open admin page whether a customer is sitting in a video call with nobody there. */
export async function GET() {
  if (!(await isAdmin())) return new NextResponse(null, { status: 401 });
  const [waiting, soon] = await Promise.all([waitingCustomers(), callDueSoon()]);
  // soon = a call is scheduled around now, so the page should check more often.
  return NextResponse.json({ waiting, soon: soon || waiting.length > 0 }, { headers: { "Cache-Control": "no-store" } });
}
