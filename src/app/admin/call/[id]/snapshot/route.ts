import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
const MAX_BYTES = 4 * 1024 * 1024;
/** Without file storage connected, small snapshots are kept in the database instead. */
const MAX_INLINE = 700 * 1024;

/** Saves a still image captured from the customer's video during a call. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await isAdmin()) || !/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 401 });
  const [v] = await db().select({ id: schema.visits.id }).from(schema.visits).where(eq(schema.visits.id, id));
  if (!v) return new NextResponse(null, { status: 404 });
  if (req.headers.get("content-type") !== "image/jpeg") return NextResponse.json({ error: "Snapshots must be JPEG images." }, { status: 400 });

  const bytes = Buffer.from(await req.arrayBuffer());
  // JPEG files start with FF D8 FF; refuse anything else.
  if (bytes.length < 4 || bytes.length > MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return NextResponse.json({ error: "That snapshot couldn't be saved." }, { status: 400 });
  }

  let url: string;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    url = (await put(`visits/snapshot-${Date.now()}.jpg`, bytes, { access: "public", addRandomSuffix: true, contentType: "image/jpeg" })).url;
  } else if (bytes.length <= MAX_INLINE) {
    url = `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } else {
    return NextResponse.json({ error: "Connect file storage (Vercel Blob) to save full-size snapshots." }, { status: 400 });
  }

  const [m] = await db()
    .insert(schema.visitMedia)
    .values({ visitId: v.id, url, name: `Snapshot ${fmtDateTime(new Date())}`, contentType: "image/jpeg", size: bytes.length, kind: "snapshot" })
    .returning();
  return NextResponse.json({ id: m.id, url: m.url, name: m.name, contentType: m.contentType, meta: null });
}
