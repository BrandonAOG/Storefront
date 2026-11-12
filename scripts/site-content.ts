/**
 * One-time switch from the made-up starter content to content that matches
 * alwaysongenerators.com.
 *
 * - Removes only the original placeholder services and plans (by their web
 *   address ending). Anything you created or renamed yourself is kept.
 * - Adds the website's services and the Standard / Deluxe / Always On plans.
 * - Fills in phone, email and the home page headline only where they are still
 *   at their original defaults.
 * Past bookings are not affected: they keep their own copy of names and prices.
 */
import postgres from "postgres";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";
import { OLD_PLAN_SLUGS, OLD_SERVICE_SLUGS, PLANS, SERVICES, SETTINGS } from "./content";

try {
  process.loadEnvFile(".env");
} catch {}

const OLD_HEADLINE = "Generator service, priced upfront. Book it in two minutes.";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const db = drizzle(sql, { schema });

  const goneS = await db.delete(schema.services).where(inArray(schema.services.slug, OLD_SERVICE_SLUGS)).returning({ id: schema.services.id });
  const goneP = await db.delete(schema.plans).where(inArray(schema.plans.slug, OLD_PLAN_SLUGS)).returning({ id: schema.plans.id });
  const addedS = await db.insert(schema.services).values(SERVICES).onConflictDoNothing().returning({ id: schema.services.id });
  const addedP = await db.insert(schema.plans).values(PLANS).onConflictDoNothing().returning({ id: schema.plans.id });

  await db.insert(schema.settings).values({ id: 1, ...SETTINGS }).onConflictDoNothing();
  const [s] = await db.select().from(schema.settings).where(eq(schema.settings.id, 1));
  await db
    .update(schema.settings)
    .set({
      phone: s.phone || SETTINGS.phone,
      email: s.email || SETTINGS.email,
      ...(s.heroHeadline === OLD_HEADLINE ? { heroHeadline: SETTINGS.heroHeadline, heroSub: SETTINGS.heroSub } : {}),
    })
    .where(eq(schema.settings.id, 1));

  await sql.end();
  console.log(`Removed ${goneS.length} placeholder services and ${goneP.length} placeholder plans.`);
  console.log(`Added ${addedS.length} services and ${addedP.length} plans from the website. No prices are set: add yours in /admin.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
