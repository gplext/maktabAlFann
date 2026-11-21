// Regenerates schema/*.schema.json, templates/*.csv, templates/*.json and FIELDS.md from fields.mjs.
// Run after changing fields.mjs:  node build-schema.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENTITIES } from "./fields.mjs";
import { toCsv, coerce } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const lookups = JSON.parse(fs.readFileSync(path.join(here, "lookups.json"), "utf8"));
fs.mkdirSync(path.join(here, "schema"), { recursive: true });
fs.mkdirSync(path.join(here, "templates"), { recursive: true });

const jsonType = (f) => {
  const nullable = (t) => (f.required ? t : [t, "null"]);
  switch (f.type) {
    case "int": case "year": return { type: nullable("integer"), ...(f.type === "year" ? { minimum: 1800, maximum: 2100 } : {}) };
    case "number": return { type: nullable("number"), ...(f.min != null ? { minimum: f.min } : {}), ...(f.max != null ? { maximum: f.max } : {}) };
    case "bool": return { type: nullable("boolean") };
    case "list": return { type: "array", items: { type: "string" } };
    case "enum": return { enum: [...f.values, ...(f.required ? [] : [null, ""])] };
    case "key": return { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" };
    case "url": return { type: nullable("string"), anyOf: [{ format: "uri" }, { maxLength: 0 }] };
    case "email": return { type: nullable("string"), anyOf: [{ format: "email" }, { maxLength: 0 }] };
    default: return { type: nullable("string"), ...(f.max ? { maxLength: f.max } : {}) };
  }
};

let md = "# Data intake fields\n\nGenerated from `fields.mjs`. **Required** = row is rejected without it. **DB needs** = the site's database expects it (row imports, but is reported).\nIn CSV, put several values in one cell separated by ` | `. True/false: `true` or `false`.\n";
for (const [name, ent] of Object.entries(ENTITIES)) {
  const props = {};
  for (const f of ent.fields) {
    props[f.name] = { ...jsonType(f), ...(f.doc ? { description: f.doc } : {}) };
    if (f.lookup) props[f.name].examples = lookups[f.lookup];
  }
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `maktaba-al-fann/${ent.file}.schema.json`,
    title: `${ent.title} records`,
    type: "array",
    items: { type: "object", additionalProperties: false, required: ent.fields.filter((f) => f.required).map((f) => f.name), properties: props },
  };
  fs.writeFileSync(path.join(here, "schema", `${ent.file}.schema.json`), JSON.stringify(schema, null, 2) + "\n");

  const example = Object.fromEntries(ent.fields.map((f) => [f.name, coerce(f, f.example).value]));
  fs.writeFileSync(path.join(here, "templates", `${ent.file}.csv`), toCsv(ent.fields, [example]));
  fs.writeFileSync(path.join(here, "templates", `${ent.file}.json`), JSON.stringify([example], null, 2) + "\n");

  md += `\n## ${ent.title}s — \`${ent.file}.json\` / \`${ent.file}.csv\`\n\n| Field | Type | Need | Notes |\n|---|---|---|---|\n`;
  for (const f of ent.fields) {
    const type = f.type === "enum" ? f.values.join(" / ") : f.type === "keyref" ? `key of ${f.ref}` : f.type === "list" && f.ref ? `list of ${f.ref} keys` : f.type;
    const need = f.required ? "**Required**" : f.dbRequired ? "DB needs" : "";
    const notes = [f.doc, f.lookup ? `Site values: ${lookups[f.lookup].join(", ")}` : ""].filter(Boolean).join(" ");
    md += `| \`${f.name}\` | ${type} | ${need} | ${notes} |\n`;
  }
}
fs.writeFileSync(path.join(here, "FIELDS.md"), md);
console.log("Wrote schema/, templates/ and FIELDS.md");
