/**
 * Loads the starter content so the storefront isn't empty on first run.
 * Safe to run more than once: rows that already exist are left alone.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";
import { PLANS, SERVICES, SETTINGS } from "./content";

try {
  process.loadEnvFile(".env");
} catch {}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const db = drizzle(sql, { schema });

  await db.insert(schema.settings).values({ id: 1, ...SETTINGS }).onConflictDoNothing();

  // Monday–Friday, 8 AM – 4 PM. Change in Admin → Availability.
  await db
    .insert(schema.hours)
    .values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: weekday >= 1 && weekday <= 5, startMin: 480, endMin: 960 })))
    .onConflictDoNothing();

  await db.insert(schema.services).values(SERVICES).onConflictDoNothing();
  await db.insert(schema.plans).values(PLANS).onConflictDoNothing();

  await sql.end();
  console.log("Seed complete. No prices are set: add yours in /admin.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
