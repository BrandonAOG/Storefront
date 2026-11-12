import "server-only";
import { and, desc, eq, gt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";

export type Role = "rep" | "customer";

export const signalBody = z.object({
  kind: z.enum(["ready", "offer", "answer", "ice", "bye"]),
  payload: z.unknown().optional(),
});

/** Store one signaling message. Messages are small; anything large is refused. */
export async function postSignal(visitId: string, from: Role, body: unknown): Promise<boolean> {
  const parsed = signalBody.safeParse(body);
  if (!parsed.success) return false;
  const payload = parsed.data.payload ?? null;
  if (JSON.stringify(payload).length > 20_000) return false;
  await db().insert(schema.visitSignals).values({ visitId, fromRole: from, kind: parsed.data.kind, payload });
  return true;
}

/**
 * Messages from the other side, newer than `after`. With init=true it returns
 * no messages, only the current position, so a page that just opened ignores
 * anything left over from an earlier call.
 */
export async function readSignals(visitId: string, me: Role, after: number, init: boolean) {
  const t = schema.visitSignals;
  if (init) {
    const [last] = await db().select({ id: t.id }).from(t).where(eq(t.visitId, visitId)).orderBy(desc(t.id)).limit(1);
    return { cursor: last?.id ?? 0, messages: [] };
  }
  const rows = await db()
    .select({ id: t.id, kind: t.kind, payload: t.payload })
    .from(t)
    .where(and(eq(t.visitId, visitId), ne(t.fromRole, me), gt(t.id, after)))
    .orderBy(t.id)
    .limit(100);
  return { cursor: rows.length ? rows[rows.length - 1].id : after, messages: rows };
}

/** Housekeeping, called by the daily job. */
export async function purgeOldSignals() {
  await db().delete(schema.visitSignals).where(sql`${schema.visitSignals.createdAt} < now() - interval '1 day'`);
}

/**
 * Servers that help the two browsers find a direct route to each other.
 * STUN is free and enough for most networks. TURN relays the call when a
 * direct route is blocked (some cellular and office networks); set TURN_URLS,
 * TURN_USERNAME and TURN_CREDENTIAL to add one.
 */
export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const urls = (process.env.TURN_URLS ?? "").split(",").map((u) => u.trim()).filter((u) => /^turns?:/.test(u));
  if (urls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    servers.push({ urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
  return servers;
}
