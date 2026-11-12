import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isAdmin } from "@/lib/auth";
import { postSignal, readSignals } from "@/lib/call";

export const dynamic = "force-dynamic";

/** Your side of call signaling. Lives under /admin so the admin sign-in cookie applies. */
async function visitFor(id: string) {
  if (!(await isAdmin()) || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const [v] = await db().select({ id: schema.visits.id }).from(schema.visits).where(eq(schema.visits.id, id));
  return v ?? null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await visitFor((await params).id);
  if (!v) return new NextResponse(null, { status: 401 });
  const q = new URL(req.url).searchParams;
  const after = Math.max(0, Number.parseInt(q.get("after") ?? "0", 10) || 0);
  return NextResponse.json(await readSignals(v.id, "rep", after, q.get("init") === "1"), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await visitFor((await params).id);
  if (!v) return new NextResponse(null, { status: 401 });
  const ok = await postSignal(v.id, "rep", await req.json().catch(() => null));
  return new NextResponse(null, { status: ok ? 204 : 400 });
}
