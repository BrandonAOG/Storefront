import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db, schema } from "@/db";
import { rateLimit } from "@/lib/ratelimit";
import { getSettings } from "@/lib/settings";
import { cleanAttr, getAttribution } from "@/lib/visitor";

export const dynamic = "force-dynamic";

const body = z.object({
  type: z.enum(["view", "add_to_cart", "checkout_start"]),
  path: z.string().max(200).default(""),
  utm_source: z.string().max(200).optional(),
  utm_medium: z.string().max(200).optional(),
  utm_campaign: z.string().max(200).optional(),
  referrer: z.string().max(500).optional(),
});

/** Anonymous funnel tracking. Stores a random visitor id and the page path, nothing personal. */
export async function POST(req: Request) {
  if (/bot|crawl|spider|preview|monitor/i.test(req.headers.get("user-agent") ?? "")) return new NextResponse(null, { status: 204 });
  if (!(await rateLimit("track", 120, 60))) return new NextResponse(null, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const data = parsed.data;

  const jar = await cookies();
  const attr = await getAttribution(await getSettings());
  if (!attr.visitorId) return new NextResponse(null, { status: 204 });

  // First touch wins: only record where the visitor came from if we don't know yet.
  if (!jar.get("aog_attr")) {
    let source = cleanAttr(data.utm_source);
    let medium = cleanAttr(data.utm_medium);
    if (!source && data.referrer) {
      try {
        const host = new URL(data.referrer).hostname.replace(/^www\./, "");
        if (host && host !== new URL(req.url).hostname.replace(/^www\./, "")) {
          source = cleanAttr(host);
          medium = "referral";
        }
      } catch {}
    }
    attr.source = source || "direct";
    attr.medium = medium;
    attr.campaign = cleanAttr(data.utm_campaign);
    jar.set("aog_attr", JSON.stringify({ s: attr.source, m: attr.medium, c: attr.campaign }), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90,
    });
  }

  // Private links (/order/<token>, /quote/<token>…) are stored without their token.
  const path = data.path.split("?")[0].replace(/[a-f0-9]{48}/g, ":token").slice(0, 200);
  await db().insert(schema.events).values({ visitorId: attr.visitorId, type: data.type, path, source: attr.source, medium: attr.medium, campaign: attr.campaign, variant: attr.variant });
  return new NextResponse(null, { status: 204 });
}
