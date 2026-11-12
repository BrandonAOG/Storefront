import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Customer } from "@/db/schema";
import type { Attribution } from "./visitor";

type Contact = { name: string; email: string; phone: string; address?: string; city?: string; zip?: string };

/**
 * One customer record per email address. New details overwrite blanks and old
 * values; SMS consent is only ever switched on here, never silently off.
 */
export async function upsertCustomer(c: Contact, attr?: Attribution, smsConsent = false): Promise<Customer> {
  const keep = (col: string, v?: string) => (v ? sql`excluded.${sql.raw(col)}` : sql.raw(`customers.${col}`));
  const [row] = await db()
    .insert(schema.customers)
    .values({
      email: c.email.toLowerCase(),
      token: randomBytes(24).toString("hex"),
      name: c.name,
      phone: c.phone,
      address: c.address ?? "",
      city: c.city ?? "",
      zip: c.zip ?? "",
      smsConsent,
      visitorId: attr?.visitorId ?? null,
      source: attr?.source ?? "direct",
      medium: attr?.medium ?? "",
      campaign: attr?.campaign ?? "",
      variant: attr?.variant ?? "",
    })
    .onConflictDoUpdate({
      target: schema.customers.email,
      set: {
        name: keep("name", c.name),
        phone: keep("phone", c.phone),
        address: keep("address", c.address),
        city: keep("city", c.city),
        zip: keep("zip", c.zip),
        smsConsent: smsConsent ? sql`true` : sql.raw("customers.sms_consent"),
        lastActivityAt: sql`now()`,
      },
    })
    .returning();
  return row;
}
