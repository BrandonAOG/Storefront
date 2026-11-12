import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Hands the browser a short-lived, single-file upload permit for Vercel Blob,
 * but only for someone holding a valid virtual-visit link. The file itself goes
 * straight from the browser to storage, so large videos never pass through here.
 */
export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Uploads are not switched on." }, { status: 400 });
  if (!(await rateLimit("upload", 40, 600))) return NextResponse.json({ error: "Too many uploads." }, { status: 429 });
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        if (!clientPayload || !/^[a-f0-9]{48}$/.test(clientPayload)) throw new Error("Invalid link");
        const [v] = await db().select({ id: schema.visits.id }).from(schema.visits).where(eq(schema.visits.token, clientPayload));
        if (!v) throw new Error("Invalid link");
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "video/mp4", "video/quicktime", "video/webm"],
          maximumSizeInBytes: 250 * 1024 * 1024,
          addRandomSuffix: true, // makes the file address unguessable
        };
      },
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Upload not allowed." }, { status: 400 });
  }
}
