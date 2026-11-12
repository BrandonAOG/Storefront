import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { rateLimit } from "@/lib/ratelimit";
import { customerOut, membershipOut, orderOut, quoteOut, visitOut } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/**
 * Read-only API. Authenticate with "Authorization: Bearer <key>" using a key
 * from Admin → Integrations.  GET /api/v1/{orders|customers|visits|quotes|memberships|feedback}
 * Optional: ?limit=1..100 (default 50) and ?since=<ISO date> (created after).
 */
export async function GET(req: Request, { params }: { params: Promise<{ resource: string }> }) {
  if (!(await rateLimit("api", 120, 60))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const m = /^Bearer (aog_[a-f0-9]{64})$/.exec(req.headers.get("authorization") ?? "");
  if (!m) return NextResponse.json({ error: "Missing or malformed API key" }, { status: 401 });
  const hash = createHash("sha256").update(m[1]).digest("hex");
  const [key] = await db().select().from(schema.apiKeys).where(and(eq(schema.apiKeys.hash, hash), eq(schema.apiKeys.revoked, false)));
  if (!key) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  await db().update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, key.id));

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const sinceRaw = url.searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  if (since && Number.isNaN(since.getTime())) return NextResponse.json({ error: "since must be an ISO date" }, { status: 400 });

  const { resource } = await params;
  let data: unknown[];
  switch (resource) {
    case "orders": {
      const t = schema.orders;
      data = (await db().select().from(t).where(since ? gt(t.createdAt, since) : undefined).orderBy(desc(t.createdAt)).limit(limit)).map((o) => orderOut(o));
      break;
    }
    case "customers": {
      const t = schema.customers;
      data = (await db().select().from(t).where(since ? gt(t.createdAt, since) : undefined).orderBy(desc(t.createdAt)).limit(limit)).map(customerOut);
      break;
    }
    case "visits": {
      const t = schema.visits;
      data = (await db().select().from(t).where(since ? gt(t.createdAt, since) : undefined).orderBy(desc(t.createdAt)).limit(limit)).map(visitOut);
      break;
    }
    case "quotes": {
      const t = schema.quotes;
      data = (await db().select().from(t).where(since ? gt(t.createdAt, since) : undefined).orderBy(desc(t.createdAt)).limit(limit)).map(quoteOut);
      break;
    }
    case "memberships": {
      const t = schema.memberships;
      data = (await db().select().from(t).where(since ? gt(t.createdAt, since) : undefined).orderBy(desc(t.createdAt)).limit(limit)).map(membershipOut);
      break;
    }
    case "feedback": {
      const t = schema.feedback;
      data = (await db().select().from(t).where(and(isNotNull(t.score), since ? gt(t.createdAt, since) : undefined)).orderBy(desc(t.createdAt)).limit(limit))
        .map((f) => ({ id: f.id, orderId: f.orderId, customerId: f.customerId, score: f.score, comment: f.comment, answeredAt: f.answeredAt }));
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown resource" }, { status: 404 });
  }
  return NextResponse.json({ data });
}
