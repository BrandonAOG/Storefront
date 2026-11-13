import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isAdmin } from "@/lib/auth";
import { clientId, hostBeat, hostState, markSeen, postSignal, readSignals } from "@/lib/call";

export const dynamic = "force-dynamic";

/**
 * Your side of call signaling. Lives under /admin so the admin sign-in cookie applies.
 *
 * Only the host screen may talk to the customer. Any other signed-in screen
 * can watch: it talks to the host (as=watch), never to the customer.
 */
async function visitFor(id: string) {
  if (!(await isAdmin()) || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const [v] = await db().select({ id: schema.visits.id }).from(schema.visits).where(eq(schema.visits.id, id));
  return v ?? null;
}

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await visitFor((await params).id);
  if (!v) return new NextResponse(null, { status: 401 });
  const q = new URL(req.url).searchParams;
  const client = clientId.safeParse(q.get("client"));
  if (!client.success) return new NextResponse(null, { status: 400 });
  const after = Math.max(0, Number.parseInt(q.get("after") ?? "0", 10) || 0);
  const init = q.get("init") === "1";
  const host = await hostState(v.id, client.data);

  if (q.get("as") === "watch") {
    return NextResponse.json({ ...(await readSignals(v.id, ["relay"], after, init)), host: { live: host.live, name: host.name } }, noStore);
  }
  // Someone else took over (or this screen never was the host): hand back nothing, so it can't disturb the call.
  if (!host.mine) return NextResponse.json({ cursor: after, messages: [], host: false, hostName: host.name }, noStore);
  await Promise.all([hostBeat(v.id, client.data), markSeen(v.id, "rep")]);
  return NextResponse.json({ ...(await readSignals(v.id, ["customer", "watch"], after, init)), host: true }, noStore);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await visitFor((await params).id);
  if (!v) return new NextResponse(null, { status: 401 });
  const body = (await req.json().catch(() => null)) as { client?: unknown; as?: unknown; ch?: unknown } | null;
  const client = clientId.safeParse(body?.client);
  if (!body || !client.success) return new NextResponse(null, { status: 400 });
  if (body.as === "watch") {
    return new NextResponse(null, { status: (await postSignal(v.id, "watch", body)) ? 204 : 400 });
  }
  if (!(await hostState(v.id, client.data)).mine) return new NextResponse(null, { status: 409 });
  const ok = await postSignal(v.id, body.ch === "relay" ? "relay" : "rep", body);
  return new NextResponse(null, { status: ok ? 204 : 400 });
}
