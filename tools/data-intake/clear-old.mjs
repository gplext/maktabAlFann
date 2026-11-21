#!/usr/bin/env node
// Removes every artist, artwork and gallery from the LOCAL database that was NOT loaded by
// import.mjs (i.e. not listed in data_import_keys). Imported batches are kept.
//
//   node tools/data-intake/clear-old.mjs            preview: counts only, nothing deleted
//   node tools/data-intake/clear-old.mjs --apply    back up the database, then delete
//
// A full backup (pg_dump) is written to deploy/one-off/backup-<date>.sql first; if pg_dump
// isn't installed the script stops, unless you add --no-backup.
// Linked rows go too: gallery links, commissions, artist claims/merge requests, portfolios,
// cart items, tags, supplier records, and order lines for the deleted artworks (an order left
// with no lines is deleted too; its payments go with it).
// Carousels are emptied and set back to "Latest" so they refill with the remaining artworks.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const flag = (f) => process.argv.includes(f);

let url = process.env.DATABASE_URL;
if (!url && fs.existsSync(path.join(root, ".env"))) {
  const line = fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
  if (line) url = line.replace(/^\s*DATABASE_URL\s*=\s*/, "").trim().replace(/^["']|["']$/g, "");
}
if (!url) { console.error("DATABASE_URL not found"); process.exit(2); }
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) { console.error(`Refusing: "${host}" is not the local database.`); process.exit(2); }

const { Client } = createRequire(path.join(root, "lib/db/package.json"))("pg");
const db = new Client({ connectionString: url });
await db.connect();

const has = (await db.query("SELECT to_regclass('data_import_keys') AS t")).rows[0].t;
if (!has) { console.error("No imported data found (data_import_keys is missing) — nothing would be left. Import first."); await db.end(); process.exit(1); }

const keep = `SELECT db_id FROM data_import_keys WHERE entity = $1`;
const count = async (table, entity) => Number((await db.query(`SELECT count(*) FROM ${table} WHERE id NOT IN (${keep})`, [entity])).rows[0].count);
const n = { artists: await count("artists", "artists"), artworks: await count("artworks", "artworks"), galleries: await count("galleries", "galleries") };
const kept = Object.fromEntries((await db.query("SELECT entity, count(*) FROM data_import_keys GROUP BY entity")).rows.map((r) => [r.entity, r.count]));
console.log(`Will delete: ${n.artists} artists, ${n.artworks} artworks, ${n.galleries} galleries (everything not imported).`);
console.log(`Will keep:   ${kept.artists ?? 0} artists, ${kept.artworks ?? 0} artworks, ${kept.galleries ?? 0} galleries (imported batches).`);
if (!flag("--apply")) { console.log("Preview only. Add --apply to back up and delete."); await db.end(); process.exit(0); }

// Backup first
if (!flag("--no-backup")) {
  const file = path.join(root, "deploy", "one-off", `backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.sql`);
  const r = spawnSync("pg_dump", ["--no-owner", "-f", file, url], { stdio: "inherit" });
  if (r.status !== 0 || !fs.existsSync(file)) { console.error("Backup failed (is pg_dump installed?). Nothing deleted. Use --no-backup to skip the backup."); await db.end(); process.exit(1); }
  console.log(`Backup saved: ${file}`);
}

const A = `(SELECT id FROM artists WHERE id NOT IN (SELECT db_id FROM data_import_keys WHERE entity='artists'))`;
const W = `(SELECT id FROM artworks WHERE id NOT IN (SELECT db_id FROM data_import_keys WHERE entity='artworks') OR artist_id IN ${A})`;
const G = `(SELECT id FROM galleries WHERE id NOT IN (SELECT db_id FROM data_import_keys WHERE entity='galleries'))`;
const steps = [
  ["gallery artwork links", `DELETE FROM gallery_artworks WHERE artwork_id IN ${W} OR gallery_id IN ${G}`],
  ["gallery artist links", `DELETE FROM gallery_artists WHERE artist_id IN ${A} OR gallery_id IN ${G}`],
  ["commissions", `DELETE FROM gallery_commission WHERE artwork_id IN ${W} OR artist_id IN ${A}`],
  ["artist claims", `DELETE FROM artist_claims WHERE artist_id IN ${A}`],
  ["merge requests", `DELETE FROM artist_merge_requests WHERE artist_id IN ${A}`],
  ["portfolios", `DELETE FROM portfolio WHERE artist_id IN ${A}`],
  ["order lines (old artworks)", `WITH gone AS (DELETE FROM order_line_items WHERE artwork_id IN ${W} OR for_artwork_id IN ${W} RETURNING order_id)
     SELECT count(*) FROM gone`],
  ["orders left empty", `DELETE FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_line_items l WHERE l.order_id = o.id)`],
  ["artworks", `DELETE FROM artworks WHERE id IN ${W}`],
  ["artists", `DELETE FROM artists WHERE id IN ${A}`],
  ["galleries", `DELETE FROM galleries WHERE id IN ${G}`],
  ["carousels reset to Latest", `UPDATE site_carousels SET pool='[]'::jsonb, items='[]'::jsonb, mode='latest', gallery_id=NULL`],
];
await db.query("BEGIN");
try {
  for (const [label, sql] of steps) {
    const exists = (await db.query("SELECT to_regclass($1) AS t", [sql.match(/(?:DELETE FROM|UPDATE)\s+(\w+)/)[1]])).rows[0].t;
    if (!exists) continue;
    const r = await db.query(sql);
    console.log(`  ${label.padEnd(26)} ${r.command === "SELECT" ? r.rows[0].count : r.rowCount}`);
  }
  await db.query("COMMIT");
  console.log("Done. Restart the API server so cached pages and carousels refresh.");
} catch (e) {
  await db.query("ROLLBACK");
  console.error("Stopped, nothing deleted:", e.message);
  process.exitCode = 1;
}
await db.end();
