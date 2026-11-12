import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runDailyJobs } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called once a day by Vercel Cron, which sends "Authorization: Bearer <CRON_SECRET>". */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  if (!secret || secret.length < 16 || given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return NextResponse.json({ ok: true, done: await runDailyJobs() });
}
