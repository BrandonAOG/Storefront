import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;
const g = globalThis as unknown as { __aogDb?: Db };

/** Lazily-created database handle, reused across hot reloads and warm invocations. */
export function db(): Db {
  if (!g.__aogDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // prepare:false keeps this compatible with pooled connections (Neon, pgbouncer).
    g.__aogDb = drizzle(postgres(url, { max: 5, prepare: false }), { schema });
  }
  return g.__aogDb;
}

export { schema };
