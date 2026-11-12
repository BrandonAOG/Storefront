import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { postSignal, readSignals } from "@/lib/call";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Customer side of call signaling. The private visit link token is the credential. */
async function visitFor(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const [v] = await db().select({ id: schema.visits.id, status: schema.visits.status }).from(schema.visits).where(eq(schema.visits.token, token));
  return v && (v.status === "new" || v.status === "scheduled") ? v : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!(await rateLimit("call", 600, 60))) return new NextResponse(null, { status: 429 });
  const v = await visitFor((await params).token);
  if (!v) return new NextResponse(null, { status: 404 });
  const q = new URL(req.url).searchParams;
  const after = Math.max(0, Number.parseInt(q.get("after") ?? "0", 10) || 0);
  return NextResponse.json(await readSignals(v.id, "customer", after, q.get("init") === "1"), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!(await rateLimit("call", 600, 60))) return new NextResponse(null, { status: 429 });
  const v = await visitFor((await params).token);
  if (!v) return new NextResponse(null, { status: 404 });
  const ok = await postSignal(v.id, "customer", await req.json().catch(() => null));
  return new NextResponse(null, { status: ok ? 204 : 400 });
}
