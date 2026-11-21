import { Router, type IRouter, type Request, type Response } from "express";
import { eq, asc, sql } from "drizzle-orm";
import {
  db, frameProfilesTable, surfaceFinishesTable, shopItemsTable, artworksTable, toMoney,
  type FrameProfile, type ShopItem,
} from "@workspace/db";
import { requireAdminSession } from "./admin-auth";
import {
  framesForArtworks, isFrameType, finishOf, widthOf, mountOf, profileFor,
  FINISHES, WIDTHS, MOUNTS, type FinishKey, type WidthKey, type MountKey,
} from "../lib/frames";

/**
 * Frames: the public "frames for this artwork" endpoint, and the simple Admin → Frames list.
 * A frame = name, finish, width, mount, glass, price per metre, on/off.
 */
const router: IRouter = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) { res.status(400).json({ error: e?.message ?? "Invalid request." }); }
};
const pick = <T extends string>(v: unknown, keys: readonly T[], label: string): T | undefined => {
  if (v === undefined) return undefined;
  if (keys.includes(v as T)) return v as T;
  throw new Error(`${label} must be one of: ${keys.join(", ")}.`);
};

// ── Public ───────────────────────────────────────────────────────────────────
router.get("/lookup/surface-finishes", async (_req, res) => {
  res.json(await db.select().from(surfaceFinishesTable).orderBy(asc(surfaceFinishesTable.displayOrder)));
});

/** Every frame for this artwork: whether it can be framed, the final size and the price. */
router.get("/artworks/:id/compatible-frames", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return void res.status(400).json({ error: "Invalid id" });
  const [a] = await db.select({ id: artworksTable.id }).from(artworksTable).where(eq(artworksTable.id, id)).limit(1);
  if (!a) return void res.status(404).json({ error: "Artwork not found" });
  const frames = (await framesForArtworks([id])).get(id) ?? [];
  res.json({ artworkId: id, frames });
});

// ── Simple frames (Admin, and the public list for the shop) ──────────────────
type SimpleFrame = {
  id: number; name: string; finish: FinishKey | "custom"; width: WidthKey; mount: MountKey; glass: boolean;
  price: number; active: boolean; imageUrl: string;
  look: { finish: FinishKey | "custom"; colourHex: string; metalness: number; roughness: number; profileShape: string; textureUrl: string | null; faceWidthMm: number };
};
const toSimple = (i: ShopItem, p: FrameProfile): SimpleFrame => ({
  id: i.id, name: i.name, finish: finishOf(p), width: widthOf(p), mount: mountOf(i), glass: i.glazing !== "none",
  price: Number(i.price), active: i.status === "active", imageUrl: i.imageUrl,
  look: { finish: finishOf(p), colourHex: p.colourHex, metalness: p.metalness, roughness: p.roughness, profileShape: p.profileShape, textureUrl: p.textureUrl, faceWidthMm: p.faceWidthMm },
});

async function loadFrames(ids?: number[]) {
  const items = (await db.select().from(shopItemsTable).orderBy(asc(shopItemsTable.id)))
    .filter((i) => isFrameType(i.type) && (!ids || ids.includes(i.id)));
  const profiles = await db.select().from(frameProfilesTable);
  return items.map((i) => toSimple(i, profileFor(i, profiles).profile));
}

/** Public: the frames offered to customers, with their look (the shop draws a painting inside each). */
router.get("/frames", async (_req, res) => {
  res.json((await loadFrames()).filter((f) => f.active));
});

/**
 * Public: strong paintings to show inside frame previews (shop cards, Admin).
 * The Artists-page slide paintings first, then the most valuable landscape paintings; one per artist.
 */
let previewCache: { at: number; rows: { id: number; title: string; imageUrl: string }[] } | null = null;
router.get("/frames/preview-paintings", async (_req, res) => {
  if (!previewCache || Date.now() - previewCache.at > 10 * 60_000) {
    const r = await db.execute(sql`
      SELECT id, title, "imageUrl" FROM (
        SELECT DISTINCT ON (a.artist_id) a.id, a.title, a.image_url AS "imageUrl", a.artist_slide AS slide,
               coalesce(a.display_price, a.expected_price, 0) AS value
        FROM artworks a
        JOIN artists ar ON ar.id = a.artist_id AND ar.is_verified = 'approved'
        JOIN art_categories c ON c.id = a.art_category_id AND lower(c.name) = 'paintings'
        WHERE a.status = 'approved' AND a.image_url <> '' AND a.image_url NOT LIKE '%placehold.co%'
          AND a.width_cm > 0 AND a.height_cm > 0 AND a.width_cm::float / a.height_cm BETWEEN 1.2 AND 1.8
        ORDER BY a.artist_id, a.artist_slide DESC, coalesce(a.display_price, a.expected_price, 0) DESC
      ) best
      ORDER BY slide DESC, value DESC
      LIMIT 12`);
    previewCache = { at: Date.now(), rows: r.rows as any };
  }
  res.json(previewCache.rows);
});

/** The profile (moulding) fields that follow from the simple choices. */
function profileFrom(finish: FinishKey | undefined, width: WidthKey | undefined) {
  return {
    ...(finish ? { colourHex: FINISHES[finish].colourHex, metalness: FINISHES[finish].metalness, roughness: FINISHES[finish].roughness, profileShape: FINISHES[finish].profileShape, material: FINISHES[finish].material, textureUrl: null } : {}),
    ...(width ? { faceWidthMm: WIDTHS[width].faceWidthMm, depthMm: WIDTHS[width].depthMm, style: width, rebateDepthMm: WIDTHS[width].depthMm - 5 } : {}),
  };
}
function itemFrom(b: any) {
  const mount = pick(b.mount, Object.keys(MOUNTS) as MountKey[], "Mount");
  const price = b.price;
  if (price !== undefined && (price === null || price === "" || !(Number(price) >= 0))) throw new Error("Give the frame a price (0 or more).");
  const name = b.name === undefined ? undefined : String(b.name).trim().slice(0, 80);
  if (name !== undefined && name.length < 2) throw new Error("Give the frame a name.");
  return Object.fromEntries(Object.entries({
    name,
    ...(mount ? { matWidthMm: MOUNTS[mount].matWidthMm, matColourHex: MOUNTS[mount].matColourHex } : {}),
    glazing: b.glass === undefined ? undefined : b.glass ? "glass" : "none",
    price: price === undefined ? undefined : toMoney(Number(price)),
    status: typeof b.active === "boolean" ? (b.active ? "active" : "inactive") : undefined,
  }).filter(([, v]) => v !== undefined));
}

router.get("/admin/frames", requireAdminSession, async (_req, res) => {
  res.json({
    frames: await loadFrames(),
    options: {
      finishes: Object.entries(FINISHES).map(([value, f]) => ({ value, label: f.label, colourHex: f.colourHex, metalness: f.metalness })),
      widths: Object.entries(WIDTHS).map(([value, w]) => ({ value, label: w.label, mm: w.faceWidthMm })),
      mounts: Object.entries(MOUNTS).map(([value, m]) => ({ value, label: m.label, colourHex: m.matColourHex })),
    },
  });
});

router.post("/admin/frames", requireAdminSession, wrap(async (req, res) => {
  const b = req.body ?? {};
  const finish = pick(b.finish ?? "black", Object.keys(FINISHES) as FinishKey[], "Finish")!;
  const width = pick(b.width ?? "standard", Object.keys(WIDTHS) as WidthKey[], "Width")!;
  const fields = itemFrom({ mount: "none", glass: false, active: true, ...b });
  if (!fields.name) throw new Error("Give the frame a name.");
  if (fields.price === undefined) throw new Error("Give the frame a price.");
  const id = await db.transaction(async (tx) => {
    const [item] = await tx.insert(shopItemsTable).values({
      ...(fields as any), type: "Frames", isAddon: true, backing: "hardboard", stock: 0, pricePerMetre: null,
      description: `${FINISHES[finish].label} frame, ${WIDTHS[width].label.toLowerCase()} width, made to measure.`,
    }).returning();
    const [prof] = await tx.insert(frameProfilesTable).values({
      name: `Frame #${item!.id}`, rebateWidthMm: 5, revealGapMm: 0, active: true, ...(profileFrom(finish, width) as any),
    }).returning();
    await tx.update(shopItemsTable).set({ frameProfileId: prof!.id }).where(eq(shopItemsTable.id, item!.id));
    return item!.id;
  });
  res.status(201).json((await loadFrames([id]))[0]);
}));

router.patch("/admin/frames/:id", requireAdminSession, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const [item] = await db.select().from(shopItemsTable).where(eq(shopItemsTable.id, id));
  if (!item || !isFrameType(item.type)) return void res.status(404).json({ error: "Frame not found." });
  const finish = b.finish === "custom" ? undefined : pick(b.finish, Object.keys(FINISHES) as FinishKey[], "Finish");
  const width = pick(b.width, Object.keys(WIDTHS) as WidthKey[], "Width");
  const fields = itemFrom(b);
  const profiles = await db.select().from(frameProfilesTable);
  const { profile, saved } = profileFor(item, profiles);
  await db.transaction(async (tx) => {
    let profileId = saved ? profile.id : null;
    if (profileId == null) {
      // An older frame without a saved moulding: save the look it was shown with, plus any change.
      const { id: _id, ...guess } = profile;
      const [prof] = await tx.insert(frameProfilesTable).values({ ...guess, name: `Frame #${item.id}`, ...(profileFrom(finish, width) as any) }).returning();
      profileId = prof!.id;
    } else if (finish || width) {
      await tx.update(frameProfilesTable).set({ ...(profileFrom(finish, width) as any), active: true }).where(eq(frameProfilesTable.id, profileId));
    }
    // Fixed price; every frame is made to measure (no old fixed opening size).
    await tx.update(shopItemsTable).set({ ...(fields as any), frameProfileId: profileId, pricePerMetre: null, innerWidthMm: null, innerHeightMm: null, revealGapMm: null })
      .where(eq(shopItemsTable.id, id));
  });
  res.json((await loadFrames([id]))[0]);
}));

/** Deletes the frame; one that is in past orders is switched off instead. */
router.delete("/admin/frames/:id", requireAdminSession, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [item] = await db.select().from(shopItemsTable).where(eq(shopItemsTable.id, id));
  if (!item || !isFrameType(item.type)) return void res.status(404).json({ error: "Frame not found." });
  try {
    await db.transaction(async (tx) => {
      await tx.delete(shopItemsTable).where(eq(shopItemsTable.id, id));
      // Remove its moulding only if no other frame uses it.
      if (item.frameProfileId != null) {
        const others = await tx.select({ id: shopItemsTable.id }).from(shopItemsTable).where(eq(shopItemsTable.frameProfileId, item.frameProfileId));
        if (!others.length) await tx.delete(frameProfilesTable).where(eq(frameProfilesTable.id, item.frameProfileId));
      }
    });
    res.json({ ok: true, deleted: true });
  } catch {
    await db.update(shopItemsTable).set({ status: "inactive" }).where(eq(shopItemsTable.id, id));
    res.json({ ok: true, deleted: false, message: "This frame is in past orders, so it was switched off instead of deleted." });
  }
}));

export default router;
