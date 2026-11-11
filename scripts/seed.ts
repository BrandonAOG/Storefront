/**
 * Loads starter content so the storefront isn't empty on first run.
 * Safe to run more than once: rows that already exist are left alone.
 *
 * EVERY PRICE AND DESCRIPTION BELOW IS A PLACEHOLDER. Replace them with your
 * real offers in /admin before sending customers to the site.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";

try {
  process.loadEnvFile(".env");
} catch {}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const db = drizzle(sql, { schema });

  await db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing();

  // Monday–Friday, 8 AM – 4 PM.
  await db
    .insert(schema.hours)
    .values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: weekday >= 1 && weekday <= 5, startMin: 480, endMin: 960 })))
    .onConflictDoNothing();

  await db
    .insert(schema.services)
    .values([
      { slug: "annual-maintenance", name: "Annual maintenance visit", category: "Maintenance", sortOrder: 10, priceCents: 29900, summary: "Full yearly service for an air-cooled standby generator.", description: "PLACEHOLDER – describe exactly what your annual service includes (oil and filter, spark plugs, air filter, battery test, transfer switch check, test run, and so on)." },
      { slug: "oil-filter-service", name: "Oil & filter service", category: "Maintenance", sortOrder: 20, priceCents: 17900, summary: "Oil and filter change with a multi-point inspection.", description: "PLACEHOLDER – describe what is included." },
      { slug: "battery-replacement", name: "Battery replacement", category: "Repair", sortOrder: 30, priceCents: 24900, summary: "New starting battery supplied, installed and tested.", description: "PLACEHOLDER – describe what is included." },
      { slug: "diagnostic-call", name: "Diagnostic service call", category: "Repair", sortOrder: 40, priceCents: 14900, summary: "A technician finds out why your generator won't start or run.", description: "PLACEHOLDER – explain what the diagnostic fee covers and how repairs are quoted." },
      { slug: "new-generator-installation", name: "New generator installation", category: "Installation", sortOrder: 50, priceType: "quote", summary: "Whole-home standby generator, sized and installed for your property.", description: "PLACEHOLDER – describe your installation process, permitting and timeline." },
      { slug: "transfer-switch-upgrade", name: "Transfer switch upgrade", category: "Installation", sortOrder: 60, priceType: "quote", summary: "Replace or upgrade an automatic transfer switch.", description: "PLACEHOLDER – describe the work." },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.plans)
    .values([
      { slug: "essential", name: "Essential", sortOrder: 10, priceCents: 29900, interval: "year", summary: "One maintenance visit a year.", features: "PLACEHOLDER – 1 scheduled maintenance visit per year\nPLACEHOLDER – Priority scheduling" },
      { slug: "plus", name: "Plus", sortOrder: 20, priceCents: 49900, interval: "year", summary: "Two visits a year for generators that work hard.", features: "PLACEHOLDER – 2 scheduled maintenance visits per year\nPLACEHOLDER – Priority scheduling\nPLACEHOLDER – Discount on repairs" },
      { slug: "monthly", name: "Total Care", sortOrder: 30, priceCents: 5900, interval: "month", summary: "Everything in Plus, billed monthly.", features: "PLACEHOLDER – 2 scheduled maintenance visits per year\nPLACEHOLDER – Priority storm response\nPLACEHOLDER – Discount on repairs" },
    ])
    .onConflictDoNothing();

  await sql.end();
  console.log("Seed complete. Remember: all prices and descriptions are placeholders.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
