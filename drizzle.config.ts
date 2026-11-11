import { defineConfig } from "drizzle-kit";

// Load .env when running locally; on a host the variable is already set.
try {
  process.loadEnvFile(".env");
} catch {}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
