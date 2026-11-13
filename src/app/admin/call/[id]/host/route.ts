import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { isAdmin } from "@/lib/auth";
import { claimHost, clientId, hostState, personName, releaseHost } from "@/lib/call";

export const dynamic = "force-dynamic";

/** Who is running this call. One screen hosts; others can watch or take over. Admin sign-in required. */
async function visitFor(id: string) {
  if (!(await isAdmin()) || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const [v] = await db().select({ id: schema.visits.id }).from(schema.visits).where(eq(schema.visits.id, id));
  return v ?? null;
}

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await visitFor((await params).id);
  if (!v) return new NextResponse(null, { status: 401 });
  const client = clientId.safeParse(new URL(req.url).searchParams.get("client"));
  if (!client.success) return new NextResponse(null, { status: 400 });
  return NextResponse.json(await hostState(v.id, client.data), noStore);
}

const body = z.object({ client: clientId, name: personName.optional(), action: z.enum(["claim", "takeover", "release"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await visitFor((await params).id);
  if (!v) return new NextResponse(null, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const { client, name, action } = parsed.data;
  if (action === "release") await releaseHost(v.id, client);
  else await claimHost(v.id, client, name || "A teammate", action === "takeover");
  return NextResponse.json(await hostState(v.id, client), noStore);
}
