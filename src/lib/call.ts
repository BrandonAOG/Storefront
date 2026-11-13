import "server-only";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";

export type Role = "rep" | "customer";
/**
 * Who a setup message is from. "rep" is the host talking to the customer.
 * "watch" and "relay" are a second, separate conversation between a view-only
 * teammate and the host; the customer never sees those.
 */
export type Sender = Role | "watch" | "relay";

export const signalBody = z.object({
  kind: z.enum(["ready", "offer", "answer", "ice", "bye"]),
  payload: z.unknown().optional(),
});

/** Store one signaling message. Messages are small; anything large is refused. */
export async function postSignal(visitId: string, from: Sender, body: unknown): Promise<boolean> {
  const parsed = signalBody.safeParse(body);
  if (!parsed.success) return false;
  const payload = parsed.data.payload ?? null;
  if (JSON.stringify(payload).length > 20_000) return false;
  await db().insert(schema.visitSignals).values({ visitId, fromRole: from, kind: parsed.data.kind, payload });
  return true;
}

/**
 * Messages from the given senders, newer than `after`. With init=true it returns
 * no messages, only the current position, so a page that just opened ignores
 * anything left over from an earlier call.
 */
export async function readSignals(visitId: string, from: Sender[], after: number, init: boolean) {
  const t = schema.visitSignals;
  if (init) {
    const [last] = await db().select({ id: t.id }).from(t).where(eq(t.visitId, visitId)).orderBy(desc(t.id)).limit(1);
    return { cursor: last?.id ?? 0, messages: [] };
  }
  const rows = await db()
    .select({ id: t.id, from: t.fromRole, kind: t.kind, payload: t.payload })
    .from(t)
    .where(and(eq(t.visitId, visitId), inArray(t.fromRole, from), gt(t.id, after)))
    .orderBy(t.id)
    .limit(100);
  return { cursor: rows.length ? rows[rows.length - 1].id : after, messages: rows };
}

/**
 * Only one screen on your side runs a call at a time: the host. A host that
 * stops checking in (closed tab, lost connection) is forgotten after 15 seconds.
 */
const HOST_LIVE = sql`${schema.visits.hostSeenAt} > now() - interval '15 seconds'`;
export const clientId = z.string().regex(/^[0-9a-f-]{36}$/);
export const personName = z.string().trim().max(40);

/** Who is hosting right now, and whether that is the screen asking. */
export async function hostState(visitId: string, client: string) {
  const v = schema.visits;
  const [row] = await db().select({ id: v.hostId, name: v.hostName, live: sql<boolean>`coalesce(${HOST_LIVE}, false)` }).from(v).where(eq(v.id, visitId));
  const live = Boolean(row?.id && row.live);
  return { live, mine: live && row!.id === client, name: live ? row!.name || "Someone else" : "" };
}

/** Become the host. Without `force` this only works when nobody else is hosting. */
export async function claimHost(visitId: string, client: string, name: string, force: boolean): Promise<boolean> {
  const v = schema.visits;
  const free = force ? sql`true` : sql`(${v.hostId} is null or ${v.hostId} = ${client} or ${v.hostSeenAt} is null or not (${HOST_LIVE}))`;
  const rows = await db().update(v).set({ hostId: client, hostName: name, hostSeenAt: new Date() }).where(and(eq(v.id, visitId), free)).returning({ id: v.id });
  return rows.length > 0;
}

export async function releaseHost(visitId: string, client: string) {
  const v = schema.visits;
  await db().update(v).set({ hostId: null, hostName: null, hostSeenAt: null }).where(and(eq(v.id, visitId), eq(v.hostId, client)));
}

/** The host checking in. Written at most every 4 seconds. */
export async function hostBeat(visitId: string, client: string) {
  const v = schema.visits;
  await db().update(v).set({ hostSeenAt: new Date() }).where(and(eq(v.id, visitId), eq(v.hostId, client), sql`${v.hostSeenAt} < now() - interval '4 seconds'`));
}

/**
 * Notes that one side has the call page open right now. Written at most every
 * 10 seconds per side, so the constant polling during a call stays cheap.
 */
export async function markSeen(visitId: string, role: Role) {
  const col = role === "rep" ? schema.visits.repSeenAt : schema.visits.customerSeenAt;
  await db()
    .update(schema.visits)
    .set(role === "rep" ? { repSeenAt: new Date() } : { customerSeenAt: new Date() })
    .where(and(eq(schema.visits.id, visitId), sql`(${col} is null or ${col} < now() - interval '10 seconds')`));
}

/** Customers who have the call page open while nobody on your side is in the room. */
export async function waitingCustomers() {
  const v = schema.visits;
  return db()
    .select({ id: v.id, name: v.name })
    .from(v)
    .where(and(sql`${v.customerSeenAt} > now() - interval '25 seconds'`, sql`(${v.repSeenAt} is null or ${v.repSeenAt} < now() - interval '25 seconds')`))
    .limit(5);
}

/** True when a video call is scheduled within the next 30 minutes or started in the last 60. */
export async function callDueSoon(): Promise<boolean> {
  const v = schema.visits;
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(v)
    .where(and(eq(v.status, "scheduled"), sql`${v.scheduledAt} between now() - interval '60 minutes' and now() + interval '30 minutes'`));
  return (row?.n ?? 0) > 0;
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
