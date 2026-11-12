import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { RepRoom } from "@/components/call/RepRoom";
import type { MeasureMeta } from "@/components/MeasureTool";
import { requireAdmin } from "@/lib/auth";
import { iceServers } from "@/lib/call";
import { appUrl } from "@/lib/stripe";
import { addCallNote, listShots, saveMeasurements } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Virtual visit call", robots: { index: false } };

export default async function CallRoom({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [v] = await db().select().from(schema.visits).where(eq(schema.visits.id, id));
  if (!v || !v.token) notFound();
  const [media, notes] = await Promise.all([
    db().select().from(schema.visitMedia).where(eq(schema.visitMedia.visitId, id)).orderBy(asc(schema.visitMedia.createdAt)),
    db().select({ id: schema.visitNotes.id, body: schema.visitNotes.body }).from(schema.visitNotes).where(eq(schema.visitNotes.visitId, id)).orderBy(asc(schema.visitNotes.createdAt)),
  ]);
  return (
    <RepRoom
      visit={{ id: v.id, name: v.name, phone: v.phone, email: v.email, address: v.address, zip: v.zip, topic: v.topic, details: v.details, location: v.lat !== null && v.lng !== null ? { lat: v.lat, lng: v.lng, accuracy: v.locAccuracy ?? 0 } : null }}
      iceServers={iceServers()}
      shots={media.filter((m) => m.contentType.startsWith("image/")).map((m) => ({ id: m.id, url: m.url, name: m.name || "Photo", meta: (m.meta as MeasureMeta | null) ?? null }))}
      notes={notes}
      customerLink={`${appUrl()}/call/${v.token}`}
      addNote={addCallNote}
      saveMeasure={saveMeasurements}
      listShots={listShots as (visitId: string) => Promise<{ id: string; url: string; name: string; meta: MeasureMeta | null }[]>}
    />
  );
}
