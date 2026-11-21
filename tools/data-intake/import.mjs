#!/usr/bin/env node
// Imports a checked data folder (artists / galleries / artworks) into the database (local by default).
//
//   node tools/data-intake/import.mjs <data-folder> --batch <name>            preview only (nothing saved)
//   node tools/data-intake/import.mjs <data-folder> --batch <name> --apply    save
//   node tools/data-intake/import.mjs --remove --batch <name> [--apply]       delete everything that batch imported
//
// Options
//   --create-lookups      add styles / art types / materials / bases that the site doesn't have yet
//   --hide-no-image       artworks without a picture get status needs_image (hidden) instead of approved
//   --pending             import artists, galleries and artworks as pending (not shown publicly)
//   --allow-remote        allow a database that isn't on this computer (off by default, on purpose)
//   --allow-made-up       allow records with invented test values (madeUpFields) into that database
//
// On the live site (Coolify → app → Terminal), the data in seed/ is imported with:
//   node tools/data-intake/import.mjs seed/pk-real-data --batch pk-v4 --apply --create-lookups --allow-remote --allow-made-up
//   --prune               also delete records this batch imported earlier that are no longer in the data
//   --no-download         keep picture links pointing at the source website instead of copying the files
//
// Pictures given as http(s) links are downloaded once into the local uploads folder
// (UPLOAD_DIR, or <project>/uploads) — the same place the site's own uploads go — and served
// from /api/storage/objects/uploads/<id>. Already-downloaded pictures are reused.
//
// Runs validate.mjs first and stops if there are errors. Every imported row is recorded in the
// data_import_keys table, so re-running updates the same rows and --remove can undo a batch.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { ENTITIES } from "./fields.mjs";
import { loadRecords, loadPackage } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const dir = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--batch");
const batch = opt("--batch");
const apply = flag("--apply");
const remove = flag("--remove");

if (!batch || !/^[a-z0-9-]+$/.test(batch)) { console.error("Give a batch name: --batch pk-test-1 (lowercase, digits, dashes)"); process.exit(2); }
if (!remove && !dir) { console.error("Usage: node import.mjs <data-folder> --batch <name> [--apply]"); process.exit(2); }

// ── Database connection (DATABASE_URL from the environment or the repo's .env) ──
let url = process.env.DATABASE_URL;
if (!url && fs.existsSync(path.join(root, ".env"))) {
  const line = fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
  if (line) url = line.replace(/^\s*DATABASE_URL\s*=\s*/, "").trim().replace(/^["']|["']$/g, "");
}
if (!url) { console.error("DATABASE_URL not found (set it, or put it in the project's .env)"); process.exit(2); }
const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) && !flag("--allow-remote")) {
  console.error(`Refusing to import into "${host}". This tool is for the local database. Use --allow-remote only if you really mean it.`);
  process.exit(2);
}
const { Client } = loadPackage(root, "pg");
const db = new Client({ connectionString: url });
await db.connect();

const report = [];
const log = (s) => { report.push(s); console.log(s); };

await db.query(`CREATE TABLE IF NOT EXISTS data_import_keys (
  entity text NOT NULL, key text NOT NULL, db_id integer NOT NULL, batch text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (entity, key))`);

// ── Remove a batch ─────────────────────────────────────────────────────
if (remove) {
  const ids = async (e) => (await db.query("SELECT db_id FROM data_import_keys WHERE batch=$1 AND entity=$2", [batch, e])).rows.map((r) => r.db_id);
  const [aw, ar, ga] = [await ids("artworks"), await ids("artists"), await ids("galleries")];
  console.log(`Batch ${batch}: ${ar.length} artists, ${ga.length} galleries, ${aw.length} artworks`);
  if (!apply) { console.log("Preview only. Add --apply to delete them."); await db.end(); process.exit(0); }
  await db.query("BEGIN");
  try {
    await db.query("DELETE FROM gallery_artworks WHERE artwork_id = ANY($1) OR gallery_id = ANY($2)", [aw, ga]);
    await db.query("DELETE FROM gallery_artists WHERE artist_id = ANY($1) OR gallery_id = ANY($2)", [ar, ga]);
    await db.query("DELETE FROM artworks WHERE id = ANY($1)", [aw]);
    await db.query("DELETE FROM artists WHERE id = ANY($1) AND NOT EXISTS (SELECT 1 FROM artworks w WHERE w.artist_id = artists.id)", [ar]);
    await db.query("DELETE FROM galleries WHERE id = ANY($1)", [ga]);
    await db.query("DELETE FROM data_import_keys WHERE batch=$1", [batch]);
    await db.query("COMMIT");
    console.log("Deleted.");
  } catch (e) { await db.query("ROLLBACK"); console.error("Nothing deleted:", e.message); process.exitCode = 1; }
  await db.end(); process.exit();
}

// ── Check the data first ───────────────────────────────────────────────
const check = spawnSync(process.execPath, [path.join(here, "validate.mjs"), dir, "--quiet"], { stdio: "inherit" });
if (check.status !== 0) { console.error("\nThe data has errors — fix them (see validation-report.md) before importing."); await db.end(); process.exit(1); }

const data = {};
for (const [k, ent] of Object.entries(ENTITIES)) data[k] = await loadRecords(dir, ent);

// ── Pictures: download into the local uploads folder ───────────────────
const envFile = fs.existsSync(path.join(root, ".env")) ? fs.readFileSync(path.join(root, ".env"), "utf8") : "";
const envUpload = process.env.UPLOAD_DIR || envFile.match(/^\s*UPLOAD_DIR\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
const UPLOADS = path.join(path.resolve(root, envUpload || "uploads"), "uploads");
const pictureIds = new Map(); // remote url → local site path
const idFor = (u) => { const h = createHash("sha1").update(u).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };
const remoteUrls = [...new Set([...data.artists.map((a) => a.photoUrl), ...data.galleries.map((g) => g.logoUrl), ...data.artworks.map((w) => w.imageUrl)].filter((u) => /^https?:\/\//.test(u ?? "")))];
let downloaded = 0, reused = 0, failed = [];
if (!flag("--no-download")) {
  if (apply) fs.mkdirSync(UPLOADS, { recursive: true });
  const queue = [...remoteUrls];
  const worker = async () => {
    for (let u; (u = queue.shift()); ) {
      const id = idFor(u), file = path.join(UPLOADS, id);
      if (fs.existsSync(file)) { pictureIds.set(u, `/api/storage/objects/uploads/${id}`); reused++; continue; }
      if (!apply) { pictureIds.set(u, `/api/storage/objects/uploads/${id}`); continue; }
      try {
        const res = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0" }, signal: AbortSignal.timeout(60000) });
        const type = res.headers.get("content-type") ?? "";
        if (!res.ok || !type.startsWith("image/")) throw new Error(`${res.status} ${type}`);
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(file, buf);
        fs.writeFileSync(`${file}.json`, JSON.stringify({ contentType: type.split(";")[0], size: buf.length, uploadedAt: new Date().toISOString(), source: u }));
        pictureIds.set(u, `/api/storage/objects/uploads/${id}`); downloaded++;
      } catch (e) { failed.push(`${u} (${e.message})`); }
      if ((downloaded + failed.length) % 50 === 0 && downloaded) process.stdout.write(`  pictures: ${downloaded} downloaded…\r`);
    }
  };
  if (remoteUrls.length) console.log(`Pictures: ${remoteUrls.length} to ${apply ? "download (or reuse)" : "download on --apply"} into ${UPLOADS}`);
  await Promise.all(Array.from({ length: 8 }, worker));
}
// Gallery photos often sit in a white or grey box (e.g. 800 x 600 for every work). Trim that
// border so the picture's shape is the artwork's shape (cards, carousels and size checks rely on it).
let sharp = null;
try { sharp = loadPackage(root, "sharp"); } catch { /* optional */ }
let trimmed = 0;
async function trimFile(file) {
  if (!sharp || !fs.existsSync(`${file}.json`)) return;
  const meta = JSON.parse(fs.readFileSync(`${file}.json`, "utf8"));
  if (meta.trimmed || /svg/.test(meta.contentType ?? "")) return;
  try {
    const buf = fs.readFileSync(file);
    const orig = await sharp(buf).metadata();
    const { data, info } = await sharp(buf).trim({ threshold: 30 }).toBuffer({ resolveWithObject: true });
    const kept = (info.width * info.height) / (orig.width * orig.height);
    if (kept >= 0.3 && kept < 0.98) { fs.writeFileSync(file, data); meta.size = data.length; meta.untrimmedSize = [orig.width, orig.height]; trimmed++; }
    meta.trimmed = true;
    fs.writeFileSync(`${file}.json`, JSON.stringify(meta));
  } catch { /* leave the picture as it is */ }
}
if (apply && !flag("--no-download")) {
  for (const u of remoteUrls) { const id = pictureIds.get(u)?.split("/").pop(); if (id) await trimFile(path.join(UPLOADS, id)); }
  if (trimmed) {
    // Cached 16:9 carousel slides were made from the untrimmed pictures.
    const slides = path.join(path.dirname(UPLOADS), "derived", "slides-16x9");
    if (fs.existsSync(slides)) for (const f of fs.readdirSync(slides)) fs.rmSync(path.join(slides, f), { force: true });
  }
}

const picture = (u) => (!u ? "" : /^https?:\/\//.test(u) ? (flag("--no-download") ? u : pictureIds.get(u) ?? "") : u);

// Invented test values stay out of a real database unless --allow-made-up is given on purpose.
const invented = Object.values(data).flat().filter((r) => r.madeUpFields?.length).length;
if (invented && !["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) && !flag("--allow-made-up")) {
  console.error(`${invented} records contain invented test values (madeUpFields). Add --allow-made-up to import them into "${host}" anyway.`);
  await db.end(); process.exit(1);
}
if (invented) console.log(`Note: ${invented} records contain invented test values (see madeUpFields).`);

const pending = flag("--pending");
const listStatus = pending ? "pending" : "approved";
const counts = { inserted: {}, updated: {}, skipped: {} };
const bump = (kind, e) => (counts[kind][e] = (counts[kind][e] ?? 0) + 1);
const gaps = {}; // what the database can't hold, counted
const gap = (msg) => (gaps[msg] = (gaps[msg] ?? 0) + 1);

await db.query("BEGIN");
// Artist level and artist-carousel slide; the API adds these columns too, but older local databases may not have them yet.
await db.query(`ALTER TABLE artists ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'emerging'`);
await db.query(`ALTER TABLE artworks ADD COLUMN IF NOT EXISTS artist_slide boolean NOT NULL DEFAULT false`);
try {
  // Lookup tables: name → id (case-insensitive). Optionally create missing ones.
  const LOOKUP = { styles: "art_styles", categories: "art_categories", paintMaterials: "paint_materials", baseTypes: "base_types" };
  const maps = {};
  for (const [k, table] of Object.entries(LOOKUP)) {
    maps[k] = new Map((await db.query(`SELECT id, name FROM ${table}`)).rows.map((r) => [r.name.toLowerCase(), r.id]));
  }
  const created = [];
  const lookupId = async (k, name) => {
    if (!name) return null;
    const id = maps[k].get(name.toLowerCase());
    if (id) return id;
    if (!flag("--create-lookups")) { gap(`${k}: "${name}" not on the site (left empty; use --create-lookups to add)`); return null; }
    const table = LOOKUP[k];
    const { rows } = await db.query(`INSERT INTO ${table} (name, display_order) VALUES ($1, (SELECT coalesce(max(display_order),0)+1 FROM ${table})) RETURNING id`, [name]);
    maps[k].set(name.toLowerCase(), rows[0].id);
    created.push(`${table}: ${name}`);
    return rows[0].id;
  };

  const mapped = async (entity, key) => (await db.query("SELECT db_id FROM data_import_keys WHERE entity=$1 AND key=$2", [entity, key])).rows[0]?.db_id;
  const remember = (entity, key, id) => db.query(
    "INSERT INTO data_import_keys (entity, key, db_id, batch) VALUES ($1,$2,$3,$4) ON CONFLICT (entity, key) DO UPDATE SET db_id=$3, batch=$4, imported_at=now()", [entity, key, id, batch]);
  const upsert = async (entity, table, key, cols) => {
    const names = Object.keys(cols), vals = Object.values(cols);
    let id = await mapped(entity, key);
    if (id && (await db.query(`SELECT 1 FROM ${table} WHERE id=$1`, [id])).rowCount) {
      await db.query(`UPDATE ${table} SET ${names.map((n, i) => `${n}=$${i + 2}`).join(", ")} WHERE id=$1`, [id, ...vals]);
      bump("updated", entity);
    } else {
      const { rows } = await db.query(`INSERT INTO ${table} (${names.join(", ")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`, vals);
      id = rows[0].id; bump("inserted", entity);
    }
    await remember(entity, key, id);
    return id;
  };

  // Galleries
  const galleryIds = new Map();
  for (const g of data.galleries) {
    const id = await upsert("galleries", "galleries", g.key, {
      user_id: `import:${g.key}`, name: g.name, description: g.description ?? "", email: g.email ?? "", phone: g.phone ?? "",
      city: g.city ?? "", country: g.country ?? "Pakistan", website_url: g.websiteUrl ?? "", logo_url: picture(g.logoUrl), status: listStatus,
    });
    galleryIds.set(g.key, id);
    if (g.address) gap("galleries: address (no column)");
    if (g.foundedYear) gap("galleries: foundedYear (no column)");
  }

  // Artists
  const artistIds = new Map(), artistStyle = new Map();
  for (const a of data.artists) {
    if (a.birthYear == null) gap("artists: birthYear missing → saved as 0");
    if (a.deathYear) gap("artists: deathYear (no column; shown only in the short bio)");
    if (a.education) gap("artists: education (no column)");
    if (a.photoCredit || a.photoLicense) gap("artists: photo credit/licence (no column)");
    const id = await upsert("artists", "artists", a.key, {
      name: a.name, country: a.country, birth_year: a.birthYear ?? 0, gender: a.gender ?? "", style: a.style ?? "",
      level: ["master", "emerging", "student"].includes(a.level) ? a.level : "emerging",
      photo_url: picture(a.photoUrl), short_bio: a.shortBio ?? "", biography: a.biography ?? "", influences: a.influences ?? "",
      awards: a.awards ?? "", exhibitions: a.exhibitions ?? "", contact_email: a.contactEmail ?? "", website_url: a.websiteUrl ?? "",
      is_verified: listStatus,
    });
    artistIds.set(a.key, id); artistStyle.set(a.key, a.style);
    for (const gk of a.galleryKeys ?? []) if (galleryIds.has(gk))
      await db.query("INSERT INTO gallery_artists (gallery_id, artist_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [galleryIds.get(gk), id]);
  }

  // Artworks
  for (const w of data.artworks) {
    const artistId = artistIds.get(w.artistKey) ?? await mapped("artists", w.artistKey);
    const categoryId = await lookupId("categories", w.category);
    if (!artistId || !categoryId) { bump("skipped", "artworks"); gap(`artworks skipped: ${!artistId ? "artist not imported" : `art type "${w.category}" missing`}`); continue; }
    const pkr = w.price != null && (w.currency ?? "PKR") === "PKR" ? w.price : null;
    if (w.price != null && pkr == null) gap(`artworks: price in ${w.currency} not saved (site stores PKR only)`);
    if (w.heldBy) gap("artworks: heldBy (no column; written into the history text)");
    if (w.availability && w.availability !== "for-sale") gap(`artworks: availability "${w.availability}" (no column)`);
    const img = picture(w.imageUrl);
    const noImage = !img;
    if (w.imageUrl && !img) gap("artworks: picture download failed → treated as no picture");
    const status = pending ? "pending" : noImage && flag("--hide-no-image") ? "needs_image" : "approved";
    const cm = (v) => (v == null ? null : Math.round(v));
    const mm = (v) => (v == null ? null : Math.round(v * 10));
    const id = await upsert("artworks", "artworks", w.key, {
      title: w.title, artist_id: artistId, art_category_id: categoryId,
      art_style_id: await lookupId("styles", w.style ?? artistStyle.get(w.artistKey)),
      paint_material_id: await lookupId("paintMaterials", w.paintMaterial), base_type_id: await lookupId("baseTypes", w.baseType),
      medium: w.medium ?? "", theme: w.theme ?? "", year: w.year ?? 0, image_url: img, thumbnail_url: img,
      short_description: w.shortDescription ?? "",
      history: [w.longDescription ?? "", w.heldBy ? `Held in the collection of ${w.heldBy}.` : ""].filter(Boolean).join("\n\n"),
      dimensions: w.widthCm != null && w.heightCm != null ? `${w.widthCm} x ${w.heightCm} cm` : "",
      width_cm: cm(w.widthCm), height_cm: cm(w.heightCm), depth_cm: cm(w.depthCm),
      // Only when the data says so, so a re-import doesn't undo artworks featured in Admin.
      ...(w.featured != null && w.featured !== "" ? { is_featured: w.featured === true || w.featured === "true" } : {}),
      artist_slide: w.artistSlide === true || w.artistSlide === "true",
      width_mm: mm(w.widthCm), height_mm: mm(w.heightCm), depth_mm: mm(w.depthCm),
      frame_included: w.framed ?? false, expected_price: pkr, display_price: w.availability === "for-sale" ? pkr : null, status,
    });
    if (w.year == null) gap("artworks: year missing → saved as 0");
    if (noImage) gap(`artworks: no picture → ${status}`);
    if (w.galleryKey && galleryIds.has(w.galleryKey))
      await db.query("INSERT INTO gallery_artworks (gallery_id, artwork_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [galleryIds.get(w.galleryKey), id]);
  }

  // --prune: records this batch imported before but that are gone from the data now.
  const pruned = {};
  if (flag("--prune")) {
    const stale = async (entity) => {
      const keys = new Set(data[entity].map((r) => r.key));
      const rows = (await db.query("SELECT key, db_id FROM data_import_keys WHERE batch=$1 AND entity=$2", [batch, entity])).rows;
      return rows.filter((r) => !keys.has(r.key));
    };
    const [sw, sa, sg] = [await stale("artworks"), await stale("artists"), await stale("galleries")];
    const aw = sw.map((r) => r.db_id), ar = sa.map((r) => r.db_id), ga = sg.map((r) => r.db_id);
    const run = (sql, p) => db.query(sql, p);
    await run("DELETE FROM gallery_artworks WHERE artwork_id = ANY($1) OR gallery_id = ANY($2)", [aw, ga]);
    await run("DELETE FROM gallery_artists WHERE artist_id = ANY($1) OR gallery_id = ANY($2)", [ar, ga]);
    await run("DELETE FROM gallery_commission WHERE artwork_id = ANY($1) OR artist_id = ANY($2)", [aw, ar]);
    await run("DELETE FROM order_line_items WHERE artwork_id = ANY($1) OR for_artwork_id = ANY($1)", [aw]);
    await run("DELETE FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_line_items l WHERE l.order_id = o.id)");
    await run("DELETE FROM artist_claims WHERE artist_id = ANY($1)", [ar]);
    await run("DELETE FROM artist_merge_requests WHERE artist_id = ANY($1)", [ar]);
    await run("DELETE FROM portfolio WHERE artist_id = ANY($1)", [ar]);
    pruned.artworks = (await run("DELETE FROM artworks WHERE id = ANY($1)", [aw])).rowCount;
    pruned.artists = (await run("DELETE FROM artists WHERE id = ANY($1) AND NOT EXISTS (SELECT 1 FROM artworks w WHERE w.artist_id = artists.id)", [ar])).rowCount;
    pruned.galleries = (await run("DELETE FROM galleries WHERE id = ANY($1)", [ga])).rowCount;
    await run("DELETE FROM data_import_keys WHERE batch=$1 AND ((entity='artworks' AND key = ANY($2)) OR (entity='artists' AND key = ANY($3)) OR (entity='galleries' AND key = ANY($4)))",
      [batch, sw.map((r) => r.key), sa.map((r) => r.key), sg.map((r) => r.key)]);
  }

  log(`\n${apply ? "Imported" : "Preview (nothing saved)"} — batch "${batch}" into ${host}/${new URL(url).pathname.slice(1)}`);
  for (const e of ["artists", "galleries", "artworks"])
    log(`  ${e.padEnd(10)} new ${counts.inserted[e] ?? 0}, updated ${counts.updated[e] ?? 0}${counts.skipped[e] ? `, skipped ${counts.skipped[e]}` : ""}${flag("--prune") ? `, removed ${pruned[e] ?? 0}` : ""}`);
  if (created.length) log(`  Added to the site's lists: ${created.join("; ")}`);
  if (remoteUrls.length && !flag("--no-download")) log(`  Pictures: ${downloaded} downloaded, ${reused} already there, ${failed.length} failed, ${trimmed} borders trimmed${apply ? "" : " (downloads happen with --apply)"}`);
  for (const f of failed.slice(0, 20)) log(`    failed: ${f}`);
  log("\nData the site couldn't hold or had to fill in:");
  for (const [m, n] of Object.entries(gaps).sort((a, b) => b[1] - a[1])) log(`  ${String(n).padStart(4)}  ${m}`);

  if (apply) await db.query("COMMIT"); else await db.query("ROLLBACK");
  if (!apply) log("\nAdd --apply to save.");
  fs.writeFileSync(path.join(dir, "import-report.txt"), report.join("\n") + "\n");
} catch (e) {
  await db.query("ROLLBACK");
  console.error("\nImport stopped, nothing was saved:", e.message);
  process.exitCode = 1;
}
await db.end();
