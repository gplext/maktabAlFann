#!/usr/bin/env node
// Read-only report of what is in the database: every table with its row count, the artworks /
// artists by status, and any leftovers that could clash with an import. Changes nothing.
//
//   node tools/data-intake/db-check.mjs              (uses DATABASE_URL, e.g. in Coolify's app terminal)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPackage } from "./lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let url = process.env.DATABASE_URL;
if (!url && fs.existsSync(path.join(root, ".env"))) {
  const line = fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
  if (line) url = line.replace(/^\s*DATABASE_URL\s*=\s*/, "").trim().replace(/^["']|["']$/g, "");
}
if (!url) { console.error("DATABASE_URL not found"); process.exit(2); }
const { Client } = loadPackage(root, "pg");
const db = new Client({ connectionString: url });
await db.connect();
await db.query("BEGIN READ ONLY");

const q = async (sql) => (await db.query(sql)).rows;
const tables = await q(`SELECT table_schema AS s, table_name AS t FROM information_schema.tables
  WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY 1, 2`);
console.log("Rows per table:");
for (const { s, t } of tables) {
  const [{ n }] = await q(`SELECT count(*)::int AS n FROM "${s}"."${t}"`);
  if (n > 0 || s === "public") console.log(`  ${s === "public" ? "" : s + "."}${t}`.padEnd(46), n);
}
const show = async (label, sql) => console.log(label.padEnd(30), JSON.stringify(await q(sql)));
console.log();
await show("artworks by status", "SELECT status, count(*)::int FROM artworks GROUP BY 1");
await show("artists by status", "SELECT is_verified, count(*)::int FROM artists GROUP BY 1");
await show("shop items by type", "SELECT type, status, count(*)::int FROM shop_items GROUP BY 1, 2");
if ((await q("SELECT to_regclass('data_import_keys') AS t"))[0].t) {
  await show("imported batches", "SELECT batch, entity, count(*)::int FROM data_import_keys GROUP BY 1, 2");
}
if ((await q("SELECT to_regclass('site_carousels') AS t"))[0].t) {
  await show("carousels", "SELECT key, mode, jsonb_array_length(items)::int AS items FROM site_carousels");
}
const up = process.env.UPLOAD_DIR ? path.join(process.env.UPLOAD_DIR, "uploads") : null;
if (up && fs.existsSync(up)) console.log("uploaded files".padEnd(30), fs.readdirSync(up).filter((f) => !f.endsWith(".json")).length);
await db.query("ROLLBACK");
await db.end();
