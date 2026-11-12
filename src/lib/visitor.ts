import "server-only";
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { Settings } from "@/db/schema";

export type Attribution = { visitorId: string | null; source: string; medium: string; campaign: string; variant: string };

const clean = (v: unknown, max = 80) => (typeof v === "string" ? v.replace(/[^\w .:/@+-]/g, "").trim().slice(0, max) : "");

/** A = original, B = challenger. Stable per visitor. Empty when no test is running. */
export function variantFor(visitorId: string | null, s: Pick<Settings, "abEnabled" | "heroHeadlineB">): string {
  if (!s.abEnabled || !s.heroHeadlineB || !visitorId) return "";
  return createHash("sha256").update(visitorId).digest()[0] % 2 === 0 ? "A" : "B";
}

export async function getAttribution(s: Pick<Settings, "abEnabled" | "heroHeadlineB">): Promise<Attribution> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  const raw = c.get("aog_vid")?.value ?? h.get("x-aog-vid");
  const visitorId = raw && /^[0-9a-f-]{36}$/.test(raw) ? raw : null;
  let attr: { s?: unknown; m?: unknown; c?: unknown } = {};
  try {
    attr = JSON.parse(c.get("aog_attr")?.value ?? "{}");
  } catch {}
  return {
    visitorId,
    source: clean(attr.s) || "direct",
    medium: clean(attr.m),
    campaign: clean(attr.c),
    variant: variantFor(visitorId, s),
  };
}

export { clean as cleanAttr };
