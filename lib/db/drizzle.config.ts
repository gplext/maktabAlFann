import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set before running drizzle-kit.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL },
  // Kept out of drizzle's diff: the audit trail written by migration-04 is not
  // part of the app schema, and push would otherwise offer to rename or drop it.
  tablesFilter: ["!artworks_lookup_migration_audit"],
  strict: true,
  verbose: true,
});
