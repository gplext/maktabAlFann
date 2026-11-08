import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import { and, eq, inArray, asc, sql } from "drizzle-orm";
import {
  db, artworksTable, artistsTable, artCategoriesTable, artStylesTable,
  galleryCommissionTable, galleryArtworksTable, tasksTable, ordersTable, orderLineItemsTable,
} from "@workspace/db";
import { requirePermission } from "../lib/permissions";
import { readImage } from "../lib/image-size";

/**
 * Admin → Artworks → Duplicates.
 * Finds approved artworks that use the very same picture (byte-identical file),
 * hides the copies (status "needs_image") and lets an admin upload a new picture
 * for each copy, which puts it back on the site.
 */
const router: IRouter = Router();

/** Artworks waiting for a new picture: hidden from the public site until one is uploaded. */
export const NEEDS_IMAGE = "needs_image";

/**
 * migration-01 allows only pending / approved / rejected. Same change as
 * migrations/migration-10-needs-image-status.sql, applied once here so hiding works
 * even where that migration wasn't run.
 */
let statusReady: Promise<void> | null = null;
function allowNeedsImageStatus() {
  statusReady ??= db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'artworks_status_check' AND pg_get_constraintdef(oid) LIKE '%needs_image%'
      ) THEN
        ALTER TABLE artworks DROP CONSTRAINT IF EXISTS artworks_status_check;
        ALTER TABLE artworks ADD CONSTRAINT artworks_status_check
          CHECK (status IN ('pending', 'approved', 'rejected', 'needs_image'));
      END IF;
    END $$`).then(() => undefined, (e) => { statusReady = null; throw e; });
  return statusReady;
}

const fileHash = new Map<string, string | null>();
async function hashOf(url: string): Promise<string | null> {
  if (fileHash.has(url)) return fileHash.get(url)!;
  const buf = await readImage(url, true);
  const h = buf ? createHash("sha1").update(buf).digest("hex") : null;
  fileHash.set(url, h);
  return h;
}

const CARD = {
  id: artworksTable.id,
  title: artworksTable.title,
  imageUrl: artworksTable.imageUrl,
  status: artworksTable.status,
  shortDescription: artworksTable.shortDescription,
  theme: artworksTable.theme,
  medium: artworksTable.medium,
  year: artworksTable.year,
  artistName: artistsTable.name,
  artCategory: artCategoriesTable.name,
  artStyle: artStylesTable.name,
};

const cards = () =>
  db.select(CARD).from(artworksTable)
    .innerJoin(artistsTable, eq(artworksTable.artistId, artistsTable.id))
    .innerJoin(artCategoriesTable, eq(artworksTable.artCategoryId, artCategoriesTable.id))
    .leftJoin(artStylesTable, eq(artworksTable.artStyleId, artStylesTable.id));

type Card = Awaited<ReturnType<typeof cards>>[number];

/** Groups of approved artworks sharing one picture. The oldest artwork in a group keeps it. */
async function duplicateGroups(): Promise<{ keep: Card; copies: Card[] }[]> {
  const rows = await cards().where(eq(artworksTable.status, "approved")).orderBy(asc(artworksTable.id));
  const hashes = await Promise.all(rows.map((r) => hashOf(r.imageUrl)));
  const byKey = new Map<string, Card[]>();
  rows.forEach((r, i) => {
    const key = hashes[i] ?? `url:${r.imageUrl}`; // unreadable file: fall back to the same URL
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  });
  return [...byKey.values()].filter((g) => g.length > 1).map(([keep, ...copies]) => ({ keep: keep!, copies }));
}

router.get("/admin/artworks/duplicates", requirePermission("artworks.view"), async (_req, res) => {
  const [groups, waiting] = await Promise.all([
    duplicateGroups(),
    cards().where(eq(artworksTable.status, NEEDS_IMAGE)).orderBy(asc(artworksTable.id)),
  ]);
  res.json({ groups, waiting });
});

/** Hide every copy (never the artwork that keeps the picture). Re-checked on the server. */
router.post("/admin/artworks/duplicates/hide", requirePermission("artworks.approve"), async (req, res) => {
  try {
    const ids = (await duplicateGroups()).flatMap((g) => g.copies.map((c) => c.id));
    if (ids.length === 0) return void res.json({ hidden: 0 });
    await allowNeedsImageStatus();
    await db.update(artworksTable).set({ status: NEEDS_IMAGE })
      .where(and(inArray(artworksTable.id, ids), eq(artworksTable.status, "approved")));
    res.json({ hidden: ids.length });
  } catch (e) {
    req.log.error({ err: e }, "Could not hide duplicate artworks");
    res.status(500).json({ error: `Could not hide them: ${(e as Error)?.message ?? "database error"}` });
  }
});

/** Give an artwork a new picture. publish = put it back on the site. */
router.patch("/admin/artworks/:id/image", requirePermission("artworks.approve"), async (req, res) => {
  const id = Number(req.params.id);
  const imageUrl = String(req.body?.imageUrl ?? "");
  if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ error: "Invalid artwork." });
  if (!/^\/api\/storage\/objects\/uploads\/[0-9a-f-]{36}$/i.test(imageUrl)) {
    return void res.status(400).json({ error: "Upload the picture first." });
  }
  const [row] = await db.update(artworksTable)
    .set({ imageUrl, thumbnailUrl: imageUrl, ...(req.body?.publish ? { status: "approved" } : {}) })
    .where(eq(artworksTable.id, id))
    .returning({ id: artworksTable.id, status: artworksTable.status });
  if (!row) return void res.status(404).json({ error: "Not found." });
  res.json(row);
});

/**
 * Permanently delete one artwork. The artist and their other works stay.
 * Refused while the artwork is in an order that is still open (not delivered or cancelled).
 */
router.delete("/admin/artworks/:id", requirePermission("artworks.approve"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ error: "Invalid artwork." });
  try {
    const open = await db
      .select({ orderId: ordersTable.id })
      .from(orderLineItemsTable)
      .innerJoin(ordersTable, eq(orderLineItemsTable.orderId, ordersTable.id))
      .where(and(eq(orderLineItemsTable.artworkId, id), inArray(ordersTable.status, ["pending_purchase", "paid", "shipped"])))
      .limit(1);
    if (open.length) {
      return void res.status(409).json({ error: `This artwork is in open order ${open[0]!.orderId}. Deliver or cancel that order first.` });
    }
    const deleted = await db.transaction(async (tx) => {
      // Rows that point at the artwork without ON DELETE CASCADE.
      await tx.delete(galleryCommissionTable).where(eq(galleryCommissionTable.artworkId, id));
      await tx.delete(galleryArtworksTable).where(eq(galleryArtworksTable.artworkId, id));
      await tx.delete(tasksTable).where(and(eq(tasksTable.entityType, "artwork"), eq(tasksTable.entityId, String(id))));
      // Out of any saved carousel (the table may not exist yet on an old database).
      await tx.execute(sql`
        DO $$ BEGIN
          IF to_regclass('site_carousels') IS NOT NULL THEN
            UPDATE site_carousels SET
              items = COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(items) x WHERE x::int <> ${sql.raw(String(id))}), '[]'::jsonb),
              pool  = COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(pool)  x WHERE x::int <> ${sql.raw(String(id))}), '[]'::jsonb);
          END IF;
        END $$`);
      // Cart items, tags and storage rows go with it; past order lines keep their own copy.
      return tx.delete(artworksTable).where(eq(artworksTable.id, id)).returning({ id: artworksTable.id, title: artworksTable.title });
    });
    if (!deleted.length) return void res.status(404).json({ error: "Not found." });
    res.json({ deleted: deleted[0] });
  } catch (e) {
    req.log.error({ err: e }, "Could not delete artwork");
    res.status(500).json({ error: `Could not delete: ${(e as Error)?.message ?? "database error"}` });
  }
});

export default router;
