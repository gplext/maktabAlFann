import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db, siteCarouselsTable, galleriesTable } from "@workspace/db";
import { requireAdminSession } from "./admin-auth";
import {
  CAROUSELS, MODES, SCREEN, carouselDef, candidates, generatePool, measure, resolveIds,
  type CarouselDef, type CarouselMode,
} from "../lib/carousels";
import { slide16x9, slideHash, warmSlides } from "../lib/slides";

const router: IRouter = Router();

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
const idList = (v: unknown, max: number): number[] =>
  Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, max) : [];

/**
 * Same as migrations/migration-09-carousels.sql, run once per process, so the
 * Carousels tab works even on a database where the migration wasn't applied yet.
 */
let tableReady: Promise<void> | null = null;
function ensureTable() {
  tableReady ??= db.execute(sql`
    CREATE TABLE IF NOT EXISTS site_carousels (
      key         text PRIMARY KEY,
      mode        text    NOT NULL DEFAULT 'latest'
                  CHECK (mode IN ('manual', 'latest', 'gallery', 'popularity')),
      gallery_id  integer REFERENCES galleries(id) ON DELETE SET NULL,
      pool_size   integer NOT NULL DEFAULT 15 CHECK (pool_size BETWEEN 1 AND 100),
      show_count  integer NOT NULL DEFAULT 10 CHECK (show_count BETWEEN 1 AND 50),
      pool        jsonb   NOT NULL DEFAULT '[]'::jsonb,
      items       jsonb   NOT NULL DEFAULT '[]'::jsonb,
      updated_at  timestamp NOT NULL DEFAULT now()
    )`).then(() => undefined, (e) => { tableReady = null; throw e; });
  return tableReady;
}

async function savedRow(key: string) {
  try {
    await ensureTable();
    const [row] = await db.select().from(siteCarouselsTable).where(eq(siteCarouselsTable.key, key));
    return row ?? null;
  } catch {
    return null; // table missing (migration-09 not run yet): the site keeps its built-in carousels
  }
}

function withDef(req: Request, res: Response): CarouselDef | null {
  const def = carouselDef(String(req.params.key));
  if (!def) res.status(404).json({ error: "Unknown carousel." });
  return def ?? null;
}

const pageCoverage = (def: CarouselDef) =>
  Math.round(((def.frame.width * def.frame.height) / (SCREEN.width * SCREEN.height)) * 100);

/** Until a carousel is saved it shows the default algorithm's choice (cached for a minute). */
const defaultCache = new Map<string, { at: number; ids: number[] }>();
async function defaultIds(def: CarouselDef): Promise<number[]> {
  const hit = defaultCache.get(def.key);
  if (hit && Date.now() - hit.at < 60_000) return hit.ids;
  const picked = await generatePool(def, def.defaults.mode, null, def.defaults.showCount);
  const ids = picked.map((r) => r.id);
  defaultCache.set(def.key, { at: Date.now(), ids });
  if (def.kind === "artwork") warmSlides(picked.map((r) => r.imageUrl));
  return ids;
}

/** Public: the images a carousel shows, in order. */
router.get("/carousels/:key", async (req, res) => {
  const def = withDef(req, res);
  if (!def) return;
  const row = await savedRow(def.key);
  const configured = !!row && row.items.length > 0;
  const ids = configured ? row!.items.slice(0, row!.showCount) : await defaultIds(def);
  const items = (await resolveIds(def, ids)).map((it) => ({
    ...it,
    // Paintings: the 16:9 version the carousel displays (made from the original if it isn't 16:9 already).
    slideUrl: def.kind === "artwork" ? `/api/carousels/slide/${def.key}/${it.id}?h=${slideHash(it.imageUrl)}` : it.imageUrl,
  }));
  // Not cached by browsers: a save in Admin shows on the next page load.
  res.set("Cache-Control", "no-cache");
  res.json({ key: def.key, configured, items });
});

/** Public: the 16:9 WebP of one carousel image. Only for items that are public. */
router.get("/carousels/slide/:key/:id", async (req, res) => {
  const def = withDef(req, res);
  if (!def) return;
  const id = Number(req.params.id);
  const [it] = Number.isInteger(id) && id > 0 ? await resolveIds(def, [id]) : [];
  if (!it) return void res.status(404).json({ error: "Not found." });
  const buf = await slide16x9(it.imageUrl);
  if (!buf) return void res.redirect(302, it.imageUrl); // can't read the original: show it as it is
  const hash = slideHash(it.imageUrl);
  res.set("Content-Type", "image/webp");
  res.set("Cache-Control", req.query.h === hash ? "public, max-age=31536000, immutable" : "public, max-age=300");
  res.send(buf);
});

/** Admin: every carousel with its page coverage and saved settings. */
router.get("/admin/carousels", requireAdminSession, async (_req, res) => {
  const out = await Promise.all(CAROUSELS.map(async (def) => {
    const row = await savedRow(def.key);
    return {
      ...def,
      screen: SCREEN,
      pageCoverage: pageCoverage(def),
      saved: row ? { mode: row.mode, showCount: row.showCount, count: row.items.length, updatedAt: row.updatedAt } : null,
    };
  }));
  res.json(out);
});

/** Admin: one carousel — settings, the images it shows now, and the last pool. */
router.get("/admin/carousels/:key", requireAdminSession, async (req, res) => {
  const def = withDef(req, res);
  if (!def) return;
  const row = await savedRow(def.key);
  let itemIds = row?.items ?? [];
  // Not configured yet: start from what the page shows today (the default choice).
  if (!row || itemIds.length === 0) itemIds = await defaultIds(def);
  const [items, pool] = await Promise.all([
    resolveIds(def, itemIds).then((l) => measure(def, l)),
    resolveIds(def, row?.pool ?? []).then((l) => measure(def, l)),
  ]);
  res.json({
    def: { ...def, screen: SCREEN, pageCoverage: pageCoverage(def) },
    settings: {
      mode: (row?.mode ?? def.defaults.mode) as CarouselMode,
      galleryId: row?.galleryId ?? null,
      poolSize: row?.poolSize ?? def.defaults.poolSize,
      showCount: row?.showCount ?? def.defaults.showCount,
    },
    configured: !!row && row.items.length > 0,
    items,
    pool,
  });
});

/** Admin: run the selection algorithm. Nothing is saved until PUT. */
router.post("/admin/carousels/:key/generate", requireAdminSession, async (req, res) => {
  const def = withDef(req, res);
  if (!def) return;
  const mode = req.body?.mode as CarouselMode;
  if (!MODES.includes(mode) || mode === "manual") return void res.status(400).json({ error: "Choose Latest, Gallery selection or Popularity." });
  const galleryId = mode === "gallery" ? int(req.body?.galleryId, 1, 2 ** 31 - 1, 0) : 0;
  if (mode === "gallery" && !galleryId) return void res.status(400).json({ error: "Choose a gallery." });
  const poolSize = int(req.body?.poolSize, 1, 100, def.defaults.poolSize);
  res.json({ pool: await generatePool(def, mode, galleryId || null, poolSize) });
});

/** Admin: search everything that could go in this carousel. */
router.get("/admin/carousels/:key/search", requireAdminSession, async (req, res) => {
  const def = withDef(req, res);
  if (!def) return;
  const q = String(req.query.q ?? "").slice(0, 100);
  const list = await candidates(def.kind, { mode: "latest", search: q, limit: 48 });
  res.json({ results: await measure(def, list) });
});

/** Admin: galleries for the "Gallery selection" mode. */
router.get("/admin/carousels-galleries", requireAdminSession, async (_req, res) => {
  const rows = await db.select({ id: galleriesTable.id, name: galleriesTable.name, status: galleriesTable.status })
    .from(galleriesTable).orderBy(galleriesTable.name);
  res.json(rows);
});

/** Admin: save. */
router.put("/admin/carousels/:key", requireAdminSession, async (req, res) => {
  const def = withDef(req, res);
  if (!def) return;
  const mode = req.body?.mode as CarouselMode;
  if (!MODES.includes(mode)) return void res.status(400).json({ error: "Unknown mode." });
  const showCount = int(req.body?.showCount, 1, 50, def.defaults.showCount);
  const poolSize = int(req.body?.poolSize, 1, 100, def.defaults.poolSize);
  const items = idList(req.body?.items, showCount);
  if (items.length === 0) return void res.status(400).json({ error: "Add at least one image to the carousel." });
  const values = {
    key: def.key,
    mode,
    galleryId: mode === "gallery" ? int(req.body?.galleryId, 1, 2 ** 31 - 1, 0) || null : null,
    poolSize,
    showCount,
    pool: idList(req.body?.pool, 100),
    items,
    updatedAt: new Date(),
  };
  try {
    await ensureTable();
    await db.insert(siteCarouselsTable).values(values)
      .onConflictDoUpdate({ target: siteCarouselsTable.key, set: values });
    defaultCache.delete(def.key);
    if (def.kind === "artwork") void resolveIds(def, items).then((list) => warmSlides(list.map((i) => i.imageUrl)));
  } catch (e) {
    req.log.error({ err: e }, "Could not save carousel");
    return void res.status(500).json({ error: `Could not save: ${(e as Error)?.message ?? "database error"}` });
  }
  res.json({ ok: true });
});

export default router;
