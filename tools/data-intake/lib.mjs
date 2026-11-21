// Shared helpers: CSV read/write and turning rows (from JSON or CSV) into typed records.
import { LIST_SEPARATOR } from "./fields.mjs";

/** RFC 4180 CSV parser (quotes, commas and newlines inside quotes, "" escapes, BOM). */
export function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", i = 0, quoted = false;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === "") { quoted = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Records → CSV text using the entity's field order. Lists are joined with " | ". */
export function toCsv(fields, records) {
  const lines = [fields.map((f) => f.name).join(",")];
  for (const r of records) {
    lines.push(fields.map((f) => {
      const v = r[f.name];
      if (Array.isArray(v)) return csvCell(v.join(` ${LIST_SEPARATOR} `));
      if (typeof v === "boolean") return v ? "true" : "false";
      return csvCell(v);
    }).join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n"; // BOM + CRLF so Excel opens Urdu text and line breaks correctly
}

/**
 * Normalise one raw value to its field type. Returns { value, problem }.
 * Empty input → null (lists → []). Problems are type errors, reported by the validator.
 */
export function coerce(field, raw) {
  const empty = raw == null || (typeof raw === "string" && raw.trim() === "") || (Array.isArray(raw) && raw.length === 0);
  if (field.type === "list") {
    if (empty) return { value: [] };
    const arr = Array.isArray(raw) ? raw : String(raw).split(LIST_SEPARATOR);
    return { value: arr.map((s) => String(s).trim()).filter(Boolean) };
  }
  if (empty) return { value: null };
  const s = typeof raw === "string" ? raw.trim() : raw;
  switch (field.type) {
    case "int": case "year": {
      const n = typeof s === "number" ? s : Number(String(s).replace(/,/g, ""));
      if (!Number.isInteger(n)) return { value: null, problem: `"${raw}" is not a whole number` };
      return { value: n };
    }
    case "number": {
      const n = typeof s === "number" ? s : Number(String(s).replace(/,/g, ""));
      if (!Number.isFinite(n)) return { value: null, problem: `"${raw}" is not a number` };
      return { value: n };
    }
    case "bool": {
      if (typeof s === "boolean") return { value: s };
      const t = String(s).toLowerCase();
      if (["true", "yes", "y", "1"].includes(t)) return { value: true };
      if (["false", "no", "n", "0"].includes(t)) return { value: false };
      return { value: null, problem: `"${raw}" is not true/false` };
    }
    default:
      return { value: String(s) };
  }
}

/**
 * Load one entity's records from a folder: <file>.json if present, else <file>.csv.
 * Returns typed records (via coerce). Used by import.mjs; validate.mjs does its own,
 * stricter loading (it also merges and compares JSON with CSV).
 */
export async function loadRecords(dir, ent) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const jp = path.join(dir, `${ent.file}.json`), cp = path.join(dir, `${ent.file}.csv`);
  let raws = [];
  if (fs.existsSync(jp)) {
    let d = JSON.parse(fs.readFileSync(jp, "utf8"));
    raws = Array.isArray(d) ? d : (d.records ?? []);
  } else if (fs.existsSync(cp)) {
    const rows = parseCsv(fs.readFileSync(cp, "utf8"));
    const header = (rows[0] ?? []).map((h) => h.trim());
    raws = rows.slice(1).map((cells) => Object.fromEntries(header.map((h, j) => [h, cells[j] ?? ""])));
  }
  return raws.map((raw) => Object.fromEntries(ent.fields.map((f) => [f.name, coerce(f, raw[f.name]).value])));
}

/**
 * Loads a package (pg, sharp) from the project: works in the repo (pnpm workspace) and in the
 * production container, where only the API server's node_modules exist.
 */
import { createRequire as _createRequire } from "node:module";
import _fs from "node:fs";
import _path from "node:path";
export function loadPackage(root, name) {
  const bases = ["lib/db/package.json", "artifacts/api-server/package.json", "package.json"];
  for (const b of bases) {
    try { return _createRequire(_path.join(root, b))(name); } catch { /* try the next place */ }
  }
  const store = _path.join(root, "node_modules", ".pnpm");
  const dir = _fs.existsSync(store) ? _fs.readdirSync(store).find((d) => d.startsWith(`${name}@`)) : null;
  if (dir) return _createRequire(_path.join(store, dir, "node_modules", name, "package.json"))(name);
  throw new Error(`Cannot find the "${name}" package`);
}
