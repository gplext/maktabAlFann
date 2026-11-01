import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Every session runs in UTC so "timestamp" columns filled by the database (defaultNow) and
// by the app (new Date()) use the same clock, whatever timezone the server is set to.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: "-c timezone=UTC" });
export const db = drizzle(pool, { schema });

export * from "./schema";
