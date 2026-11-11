import "server-only";
import { db, schema } from "@/db";
import type { Settings } from "@/db/schema";

export async function getSettings(): Promise<Settings> {
  const rows = await db().select().from(schema.settings).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db().insert(schema.settings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db().select().from(schema.settings).limit(1))[0];
}

export function parseZips(raw: string): string[] {
  return raw.split(/[\s,]+/).map((z) => z.trim()).filter((z) => /^\d{5}$/.test(z));
}

/** True when the ZIP is inside the service area (or no area is configured). */
export function zipServed(settings: Settings, zip: string): boolean {
  const zips = parseZips(settings.serviceZips);
  return zips.length === 0 || zips.includes(zip.slice(0, 5));
}
