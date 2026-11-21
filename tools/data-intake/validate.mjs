#!/usr/bin/env node
// Checks artists / galleries / artworks data before import.
//
//   node validate.mjs <data-folder> [--strict] [--quiet]
//
// The folder may hold artists.json / artists.csv, galleries.json / galleries.csv,
// artworks.json / artworks.csv (JSON, CSV or both; when both exist they're merged and
// compared). Writes validation-report.md and validation-report.json into the folder.
// Exit code 1 when there are errors (or warnings with --strict).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENTITIES } from "./fields.mjs";
import { parseCsv, coerce } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const strict = args.includes("--strict");
const quiet = args.includes("--quiet");
if (!dir) { console.error("Usage: node validate.mjs <data-folder> [--strict] [--quiet]"); process.exit(2); }

const lookups = JSON.parse(fs.readFileSync(path.join(here, "lookups.json"), "utf8"));
const THIS_YEAR = new Date().getFullYear();
const issues = []; // { level: ERROR|WARNING|INFO, entity, key, where, field, message }
const add = (level, entity, rec, field, message) =>
  issues.push({ level, entity, key: rec?.key ?? "", where: rec?._where ?? "", field: field ?? "", message });

const norm = (s) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\b(ustad|syed|sayed|mian|haji|mohammad|muhammad|mohammed)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// ── Load ───────────────────────────────────────────────────────────────
function loadFile(entity, ent) {
  const out = { json: null, csv: null };
  const jp = path.join(dir, `${ent.file}.json`);
  const cp = path.join(dir, `${ent.file}.csv`);
  if (fs.existsSync(jp)) {
    try {
      let data = JSON.parse(fs.readFileSync(jp, "utf8"));
      if (!Array.isArray(data)) data = data.records ?? data[entity] ?? [];
      out.json = data.map((r, i) => ({ raw: r, where: `${ent.file}.json #${i + 1}` }));
    } catch (e) { add("ERROR", entity, null, "", `${ent.file}.json is not valid JSON: ${e.message}`); }
  }
  if (fs.existsSync(cp)) {
    const rows = parseCsv(fs.readFileSync(cp, "utf8"));
    if (rows.length) {
      const header = rows[0].map((h) => h.trim());
      const known = new Set(ent.fields.map((f) => f.name));
      for (const h of header) if (h && !known.has(h)) add("WARNING", entity, { _where: `${ent.file}.csv header` }, h, `Unknown column "${h}" — it will be ignored`);
      for (const f of ent.fields) if (f.required && !header.includes(f.name)) add("ERROR", entity, { _where: `${ent.file}.csv header` }, f.name, `Required column "${f.name}" is missing`);
      out.csv = rows.slice(1).map((cells, i) => {
        if (cells.length !== header.length) add("ERROR", entity, { _where: `${ent.file}.csv line ${i + 2}` }, "", `Row has ${cells.length} cells but the header has ${header.length} (check commas and quotes)`);
        return { raw: Object.fromEntries(header.map((h, j) => [h, cells[j] ?? ""])), where: `${ent.file}.csv line ${i + 2}` };
      });
    }
  }
  return out;
}

function toRecord(entity, ent, { raw, where }) {
  const rec = { _where: where };
  const known = new Set(ent.fields.map((f) => f.name));
  if (where.includes(".json")) for (const k of Object.keys(raw)) if (!known.has(k)) add("WARNING", entity, { key: raw.key, _where: where }, k, `Unknown field "${k}" — it will be ignored`);
  for (const f of ent.fields) {
    const { value, problem } = coerce(f, raw[f.name]);
    rec[f.name] = value;
    if (problem) add("ERROR", entity, { key: raw.key, _where: where }, f.name, problem);
  }
  return rec;
}

const data = {};
for (const [entity, ent] of Object.entries(ENTITIES)) {
  const { json, csv } = loadFile(entity, ent);
  const jsonRecs = (json ?? []).map((r) => toRecord(entity, ent, r));
  const csvRecs = (csv ?? []).map((r) => toRecord(entity, ent, r));
  // Merge: same key in JSON and CSV must agree.
  const merged = [...jsonRecs];
  const byKey = new Map(jsonRecs.filter((r) => r.key).map((r) => [r.key, r]));
  for (const r of csvRecs) {
    const other = r.key && byKey.get(r.key);
    if (!other) { merged.push(r); continue; }
    for (const f of ent.fields) {
      const a = JSON.stringify(other[f.name] ?? null), b = JSON.stringify(r[f.name] ?? null);
      if (a !== b) add("ERROR", entity, r, f.name, `JSON and CSV disagree: ${other._where} has ${a}, ${r._where} has ${b}`);
    }
  }
  data[entity] = merged;
  if (!json && !csv) add("INFO", entity, null, "", `No ${ent.file}.json or ${ent.file}.csv found`);
}

// ── Per-field checks ───────────────────────────────────────────────────
const dist = (a, b) => { // Levenshtein distance, for "did you mean" on typos
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const closest = (val, list) => {
  const v = norm(val);
  return list.find((x) => norm(x) === v) ?? list.find((x) => dist(norm(x), v) <= Math.max(1, Math.floor(v.length / 6)));
};
const SINGULAR = { styles: "style", categories: "category", paintMaterials: "paint material", baseTypes: "base type" };
for (const [entity, ent] of Object.entries(ENTITIES)) {
  for (const r of data[entity]) {
    for (const f of ent.fields) {
      const v = r[f.name];
      const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
      if (empty) {
        if (f.required) add("ERROR", entity, r, f.name, "Required value is missing");
        else if (f.dbRequired) add("WARNING", entity, r, f.name, "Missing (the site's database expects it; it will import as empty)");
        continue;
      }
      if (f.type === "key" && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)) add("ERROR", entity, r, f.name, `"${v}" must be lowercase letters, digits and single dashes`);
      if (f.type === "enum" && !f.values.includes(v)) {
        const hit = f.values.find((x) => x.toLowerCase() === String(v).toLowerCase());
        add("ERROR", entity, r, f.name, `"${v}" is not allowed. Use one of: ${f.values.join(", ")}${hit ? ` (did you mean "${hit}"?)` : ""}`);
      }
      if (f.type === "url") {
        try { const u = new URL(v); if (!/^https?:$/.test(u.protocol)) throw 0; }
        catch { add("ERROR", entity, r, f.name, `"${v}" is not a valid http(s) link`); }
      }
      if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) add("ERROR", entity, r, f.name, `"${v}" is not a valid email`);
      if (f.type === "year" && (v < 1800 || v > THIS_YEAR)) add("ERROR", entity, r, f.name, `${v} is outside 1800–${THIS_YEAR}`);
      if (f.type === "number" && ((f.min != null && v < f.min) || (f.max != null && v > f.max))) add("ERROR", entity, r, f.name, `${v} is outside ${f.min ?? "…"}–${f.max ?? "…"}`);
      if (f.max && typeof v === "string" && v.length > f.max) add("WARNING", entity, r, f.name, `${v.length} characters; keep it under ${f.max}`);
      if (typeof v === "string" && v !== v.trim()) add("INFO", entity, r, f.name, "Has extra spaces at the start or end");
      if (f.lookup) {
        const list = lookups[f.lookup] ?? [];
        if (!list.includes(v)) {
          const near = closest(v, list);
          add("WARNING", entity, r, f.name, near ? `"${v}" isn't on the site; did you mean "${near}"?` : `"${v}" is a new ${SINGULAR[f.lookup] ?? f.lookup} — add it in Admin before importing, or change it`);
        }
      }
    }
    if (r.madeUpFields?.length) {
      const known = new Set(ent.fields.map((f) => f.name));
      for (const f of r.madeUpFields) if (!known.has(f)) add("ERROR", entity, r, "madeUpFields", `"${f}" isn't a field`);
      add("INFO", entity, r, "madeUpFields", `Invented test values in: ${r.madeUpFields.join(", ")} — local testing only`);
    }
    if (r.dataSource === "web" && !(r.sources?.length)) add("WARNING", entity, r, "sources", "Web data without a source link — add where it came from");
  }
}

// ── Duplicates ─────────────────────────────────────────────────────────
for (const [entity] of Object.entries(ENTITIES)) {
  const seen = new Map();
  for (const r of data[entity]) {
    if (!r.key) continue;
    if (seen.has(r.key)) add("ERROR", entity, r, "key", `Duplicate key (also at ${seen.get(r.key)._where})`);
    else seen.set(r.key, r);
  }
}
{
  const names = new Map();
  for (const a of data.artists) for (const n of [a.name, ...(a.otherNames ?? [])].map(norm).filter(Boolean)) {
    const prev = names.get(n);
    if (prev && prev.key !== a.key) add("WARNING", "artists", a, "name", `Possible duplicate of "${prev.name}" (${prev.key})`);
    else names.set(n, a);
  }
  const g = new Map();
  for (const x of data.galleries) {
    const n = norm(x.name) + "|" + norm(x.city);
    if (g.has(n) && g.get(n).key !== x.key) add("WARNING", "galleries", x, "name", `Possible duplicate of ${g.get(n).key}`);
    else g.set(n, x);
  }
  const w = new Map();
  for (const x of data.artworks) {
    const n = `${x.artistKey}|${norm(x.title)}|${x.year ?? ""}`;
    if (w.has(n) && w.get(n).key !== x.key && !/^untitled$/.test(norm(x.title))) add("WARNING", "artworks", x, "title", `Possible duplicate of ${w.get(n).key} (same artist, title and year)`);
    else w.set(n, x);
  }
}

// ── Links and cross-field rules ────────────────────────────────────────
const artists = new Map(data.artists.map((a) => [a.key, a]));
const galleries = new Map(data.galleries.map((g) => [g.key, g]));
for (const a of data.artists) {
  for (const gk of a.galleryKeys ?? []) if (!galleries.has(gk)) add("ERROR", "artists", a, "galleryKeys", `Gallery "${gk}" isn't in galleries`);
  if (a.birthYear && a.deathYear && a.deathYear < a.birthYear) add("ERROR", "artists", a, "deathYear", `Died (${a.deathYear}) before born (${a.birthYear})`);
  if (a.birthYear && a.deathYear && a.deathYear - a.birthYear > 110) add("WARNING", "artists", a, "deathYear", `Lived ${a.deathYear - a.birthYear} years — check the dates`);
  if (a.birthYear && !a.deathYear && THIS_YEAR - a.birthYear > 100) add("WARNING", "artists", a, "deathYear", `Born ${a.birthYear} with no death year — would be ${THIS_YEAR - a.birthYear}; check`);
  if (a.birthYear && THIS_YEAR - a.birthYear < 12) add("WARNING", "artists", a, "birthYear", "Artist would be under 12 — check");
  if (a.photoUrl && !a.photoLicense) add("ERROR", "artists", a, "photoLicense", "Photo given without a licence/permission");
  if (a.verified && a.dataSource === "web") add("WARNING", "artists", a, "verified", "Marked verified but the data came from the web");
}
for (const g of data.galleries) {
  if (g.logoUrl && !g.isPartner) add("WARNING", "galleries", g, "logoUrl", "Logo used for a gallery that isn't a partner yet");
}
const worksPerArtist = new Map();
for (const w of data.artworks) {
  const a = artists.get(w.artistKey);
  if (w.artistKey && !a) add("ERROR", "artworks", w, "artistKey", `Artist "${w.artistKey}" isn't in artists`);
  if (w.galleryKey && !galleries.has(w.galleryKey)) add("ERROR", "artworks", w, "galleryKey", `Gallery "${w.galleryKey}" isn't in galleries`);
  if (a) {
    worksPerArtist.set(a.key, (worksPerArtist.get(a.key) ?? 0) + 1);
    if (w.year && a.birthYear && w.year < a.birthYear + 8) add("ERROR", "artworks", w, "year", `Made in ${w.year}, but ${a.name} was born in ${a.birthYear}`);
    if (w.year && a.deathYear && w.year > a.deathYear) add("ERROR", "artworks", w, "year", `Made in ${w.year}, after ${a.name} died (${a.deathYear})`);
    if (w.galleryKey && a.galleryKeys?.length && !a.galleryKeys.includes(w.galleryKey)) add("WARNING", "artworks", w, "galleryKey", `Gallery isn't listed in ${a.name}'s galleryKeys`);
  }
  if (w.availability === "for-sale" && w.price == null) add("WARNING", "artworks", w, "price", "For sale but no price");
  if (w.price != null && !w.currency) add("ERROR", "artworks", w, "currency", "Price without a currency");
  if (w.price != null && w.availability === "not-for-sale") add("WARNING", "artworks", w, "price", "Has a price but is not for sale");
  if (w.heldBy && ["for-sale", "on-request"].includes(w.availability)) add("ERROR", "artworks", w, "availability", `Held by "${w.heldBy}" but marked ${w.availability}`);
  if ((w.widthCm == null) !== (w.heightCm == null)) add("WARNING", "artworks", w, "widthCm", "Only one of width/height given");
  if (w.widthCm == null && w.heightCm == null && w.category !== "Photography") add("WARNING", "artworks", w, "widthCm", "No size — shipping and framing can't be worked out");
  if (w.imageUrl && !w.imageLicense) add("ERROR", "artworks", w, "imageLicense", "Image given without a licence/permission");
  if (!w.imageUrl) add("INFO", "artworks", w, "imageUrl", "No picture — will import as 'needs image'");
}
for (const a of data.artists) if (!worksPerArtist.get(a.key)) add("INFO", "artists", a, "", "No artworks yet (hidden on the site until one is approved)");

// ── Report ─────────────────────────────────────────────────────────────
const order = { ERROR: 0, WARNING: 1, INFO: 2 };
issues.sort((x, y) => order[x.level] - order[y.level] || x.entity.localeCompare(y.entity) || x.key.localeCompare(y.key));
const count = (lvl) => issues.filter((i) => i.level === lvl).length;
const summary = {
  checkedAt: new Date().toISOString(),
  records: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
  errors: count("ERROR"), warnings: count("WARNING"), info: count("INFO"),
  readyToImport: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.filter((r) => !issues.some((i) => i.level === "ERROR" && i.entity === k && i.key === r.key)).length])),
};
// Most common problems, so the team knows what to collect first.
const top = Object.entries(issues.reduce((m, i) => { const k = `${i.level} · ${i.entity}.${i.field || "-"} · ${i.message.replace(/"[^"]*"/g, "…").replace(/\d+/g, "#")}`; m[k] = (m[k] ?? 0) + 1; return m; }, {}))
  .sort((a, b) => b[1] - a[1]).slice(0, 25);

fs.writeFileSync(path.join(dir, "validation-report.json"), JSON.stringify({ summary, issues }, null, 2));
let md = `# Validation report\n\nChecked ${summary.checkedAt}\n\n| | Artists | Galleries | Artworks |\n|---|---|---|---|\n` +
  `| Records | ${summary.records.artists} | ${summary.records.galleries} | ${summary.records.artworks} |\n` +
  `| Without errors | ${summary.readyToImport.artists} | ${summary.readyToImport.galleries} | ${summary.readyToImport.artworks} |\n\n` +
  `**${summary.errors} errors** (must fix) · **${summary.warnings} warnings** (should fix) · ${summary.info} notes\n\n## Most common problems\n\n| Count | Problem |\n|---|---|\n` +
  top.map(([k, n]) => `| ${n} | ${k} |`).join("\n") + "\n";
for (const lvl of ["ERROR", "WARNING", "INFO"]) {
  const list = issues.filter((i) => i.level === lvl);
  if (!list.length) continue;
  md += `\n## ${lvl === "ERROR" ? "Errors" : lvl === "WARNING" ? "Warnings" : "Notes"} (${list.length})\n\n| Where | Key | Field | Problem |\n|---|---|---|---|\n`;
  md += list.map((i) => `| ${i.where} | ${i.key} | ${i.field} | ${i.message.replace(/\|/g, "\\|")} |`).join("\n") + "\n";
}
fs.writeFileSync(path.join(dir, "validation-report.md"), md);

const c = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
console.log(`Records: ${summary.records.artists} artists, ${summary.records.galleries} galleries, ${summary.records.artworks} artworks`);
console.log(`${c(31, summary.errors + " errors")}, ${c(33, summary.warnings + " warnings")}, ${summary.info} notes`);
if (!quiet) for (const i of issues.filter((i) => i.level !== "INFO").slice(0, 40)) console.log(`  ${i.level === "ERROR" ? c(31, "ERROR  ") : c(33, "WARNING")} ${i.where}  ${i.key}  ${i.field}: ${i.message}`);
if (!quiet && issues.filter((i) => i.level !== "INFO").length > 40) console.log("  …");
console.log(`Full report: ${path.join(dir, "validation-report.md")}`);
process.exit(summary.errors || (strict && summary.warnings) ? 1 : 0);
