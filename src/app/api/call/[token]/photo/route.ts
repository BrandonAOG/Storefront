import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmtDateTime } from "@/lib/format";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_INLINE = 1024 * 1024;
const MAX_PER_VISIT = 60;

/**
 * A full-quality still taken on the customer's own phone during a call, sent
 * straight from the phone. It is much sharper than a frame of the live video,
 * which is compressed for the network. The private visit link token is the credential.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) return new NextResponse(null, { status: 404 });
  if (!(await rateLimit("photo", 40, 600))) return new NextResponse(null, { status: 429 });
  const [v] = await db().select({ id: schema.visits.id, status: schema.visits.status }).from(schema.visits).where(eq(schema.visits.token, token));
  if (!v || (v.status !== "new" && v.status !== "scheduled")) return new NextResponse(null, { status: 404 });
  if (req.headers.get("content-type") !== "image/jpeg") return new NextResponse(null, { status: 400 });

  const bytes = Buffer.from(await req.arrayBuffer());
  // JPEG files start with FF D8 FF; refuse anything else.
  if (bytes.length < 4 || bytes.length > MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return new NextResponse(null, { status: 400 });
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.visitMedia).where(and(eq(schema.visitMedia.visitId, v.id), eq(schema.visitMedia.kind, "snapshot")));
  if (n >= MAX_PER_VISIT) return new NextResponse(null, { status: 429 });

  let url: string;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    url = (await put(`visits/photo-${Date.now()}.jpg`, bytes, { access: "public", addRandomSuffix: true, contentType: "image/jpeg" })).url;
  } else if (bytes.length <= MAX_INLINE) {
    url = `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } else {
    return new NextResponse(null, { status: 507 });
  }
  await db().insert(schema.visitMedia).values({ visitId: v.id, url, name: `Snapshot ${fmtDateTime(new Date())}`, contentType: "image/jpeg", size: bytes.length, kind: "snapshot" });
  return new NextResponse(null, { status: 204 });
}
