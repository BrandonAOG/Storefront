import "server-only";
import { headers } from "next/headers";

/**
 * Small in-memory rate limiter. It is per server instance, so on serverless
 * hosting it slows abuse down rather than stopping it. For a hard limit, put
 * the Vercel Firewall (or an Upstash limiter) in front of the public forms.
 */
const buckets = new Map<string, { count: number; reset: number }>();

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function rateLimit(name: string, max: number, windowSec: number): Promise<boolean> {
  const key = `${name}:${await clientIp()}`;
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowSec * 1000 });
    return true;
  }
  b.count += 1;
  return b.count <= max;
}
