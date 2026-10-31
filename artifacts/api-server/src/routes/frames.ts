import { Router, type IRouter, type Request, type Response } from "express";
import { eq, asc } from "drizzle-orm";
import {
  db, frameProfilesTable, frameCompatibilityTable, surfaceFinishesTable, baseTypesTable, shopItemsTable, artworksTable, toMoney,
} from "@workspace/db";
import { requireAdminSession } from "./admin-auth";
import { framesForArtworks } from "../lib/frames";

/**
 * Frames: profiles (mouldings), compatibility rules, surface finishes, support properties,
 * frame product details — and the public "which frames fit this artwork" endpoint.
 */
const router: IRouter = Router();

const int = (v: unknown, { min = 0, max = 100000, nullable = false } = {}): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return nullable ? null : undefined;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Value ${String(v)} is out of range.`);
  return n;
};
const num01 = (v: unknown) => (v === undefined ? undefined : Math.min(1, Math.max(0, Number(v) || 0)));
const hex = (v: unknown) => (v === undefined ? undefined : /^#[0-9a-fA-F]{6}$/.test(String(v)) ? String(v) : (() => { throw new Error("Colours must look like #A1B2C3."); })());
const oneOf = <T extends string>(v: unknown, list: readonly T[]) => (v === undefined ? undefined : list.includes(v as T) ? (v as T) : (() => { throw new Error(`Must be one of: ${list.join(", ")}.`); })());
const clean = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) {
    if (String(e?.message ?? "").includes("unique")) return void res.status(409).json({ error: "That name is already used." });
    res.status(400).json({ error: e?.message ?? "Invalid request." });
  }
};

const STYLES = ["standard", "thin", "wide", "enclosing", "floater"] as const;
const MATERIALS = ["wood", "metal", "polystyrene", "other"] as const;
const SHAPES = ["flat", "bevel", "rounded", "ornate"] as const;
const RIGIDITY = ["rigid", "flexible", "loose_sheet"] as const;
const GLAZING = ["none", "glass", "acrylic", "anti_reflective"] as const;
const BACKING = ["none", "hardboard", "foam_board"] as const;

function profileFields(b: any, creating: boolean) {
  const f = clean({
    name: b.name === undefined ? undefined : String(b.name).trim().slice(0, 80),
    style: oneOf(b.style, STYLES), material: oneOf(b.material, MATERIALS), profileShape: oneOf(b.profileShape, SHAPES),
    faceWidthMm: int(b.faceWidthMm, { min: 1, max: 400 }), depthMm: int(b.depthMm, { min: 1, max: 300 }),
    rebateWidthMm: int(b.rebateWidthMm, { max: 50 }), rebateDepthMm: int(b.rebateDepthMm, { min: 1, max: 300 }),
    revealGapMm: int(b.revealGapMm, { max: 100 }), revealColourHex: hex(b.revealColourHex),
    maxLongEdgeMm: int(b.maxLongEdgeMm, { min: 1, max: 10000, nullable: true }), maxWeightG: int(b.maxWeightG, { min: 1, max: 500000, nullable: true }),
    colourHex: hex(b.colourHex), metalness: num01(b.metalness), roughness: num01(b.roughness),
    textureUrl: b.textureUrl === undefined ? undefined : (String(b.textureUrl ?? "").trim() || null),
    active: typeof b.active === "boolean" ? b.active : undefined,
    displayOrder: int(b.displayOrder, { max: 1000 }),
  });
  if (creating) {
    if (!f.name || f.name.length < 2) throw new Error("Give the profile a name.");
    if (f.faceWidthMm == null || f.depthMm == null || f.rebateDepthMm == null) throw new Error("Face width, depth and rebate depth are required.");
  }
  return f;
}

// ── Public ───────────────────────────────────────────────────────────────────
router.get("/lookup/surface-finishes", async (_req, res) => {
  res.json(await db.select().from(surfaceFinishesTable).orderBy(asc(surfaceFinishesTable.displayOrder)));
});
router.get("/lookup/frame-profiles", async (_req, res) => {
  res.json(await db.select().from(frameProfilesTable).where(eq(frameProfilesTable.active, true)).orderBy(asc(frameProfilesTable.displayOrder)));
});

/** Every frame, whether it fits this artwork (and why not), its final size and price. */
router.get("/artworks/:id/compatible-frames", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return void res.status(400).json({ error: "Invalid id" });
  const [a] = await db.select({ id: artworksTable.id }).from(artworksTable).where(eq(artworksTable.id, id)).limit(1);
  if (!a) return void res.status(404).json({ error: "Artwork not found" });
  const frames = (await framesForArtworks([id])).get(id) ?? [];
  res.json({ artworkId: id, frames });
});

// ── Admin: profiles ──────────────────────────────────────────────────────────
router.get("/admin/frame-profiles", requireAdminSession, async (_req, res) => {
  res.json(await db.select().from(frameProfilesTable).orderBy(asc(frameProfilesTable.displayOrder), asc(frameProfilesTable.id)));
});
router.post("/admin/frame-profiles", requireAdminSession, wrap(async (req, res) => {
  const [row] = await db.insert(frameProfilesTable).values(profileFields(req.body ?? {}, true) as any).returning();
  res.status(201).json(row);
}));
router.patch("/admin/frame-profiles/:id", requireAdminSession, wrap(async (req, res) => {
  const f = profileFields(req.body ?? {}, false);
  if (!Object.keys(f).length) return void res.status(400).json({ error: "Nothing to change." });
  const [row] = await db.update(frameProfilesTable).set(f as any).where(eq(frameProfilesTable.id, Number(req.params.id))).returning();
  if (!row) return void res.status(404).json({ error: "Profile not found." });
  res.json(row);
}));
router.delete("/admin/frame-profiles/:id", requireAdminSession, wrap(async (req, res) => {
  const id = Number(req.params.id);
  await db.update(shopItemsTable).set({ frameProfileId: null }).where(eq(shopItemsTable.frameProfileId, id));
  await db.delete(frameProfilesTable).where(eq(frameProfilesTable.id, id));
  res.json({ ok: true });
}));

// ── Admin: compatibility rules ───────────────────────────────────────────────
router.get("/admin/frame-compatibility", requireAdminSession, async (_req, res) => {
  res.json(await db.select().from(frameCompatibilityTable).orderBy(asc(frameCompatibilityTable.frameProfileId)));
});
router.post("/admin/frame-compatibility", requireAdminSession, wrap(async (req, res) => {
  const b = req.body ?? {};
  const frameProfileId = int(b.frameProfileId, { min: 1 });
  if (!frameProfileId) throw new Error("Pick a frame profile.");
  const artCategoryId = int(b.artCategoryId, { min: 1, nullable: true }) ?? null;
  const baseTypeId = int(b.baseTypeId, { min: 1, nullable: true }) ?? null;
  if (artCategoryId == null && baseTypeId == null) throw new Error("Pick an art category, a support, or both.");
  const [row] = await db.insert(frameCompatibilityTable).values({ frameProfileId, artCategoryId, baseTypeId, allow: b.allow !== false }).returning();
  res.status(201).json(row);
}));
router.delete("/admin/frame-compatibility/:id", requireAdminSession, wrap(async (req, res) => {
  await db.delete(frameCompatibilityTable).where(eq(frameCompatibilityTable.id, Number(req.params.id)));
  res.json({ ok: true });
}));

// ── Admin: surface finishes ──────────────────────────────────────────────────
router.post("/admin/surface-finishes", requireAdminSession, wrap(async (req, res) => {
  const b = req.body ?? {};
  const name = String(b.name ?? "").trim().slice(0, 80);
  if (name.length < 2) throw new Error("Give the finish a name.");
  const [row] = await db.insert(surfaceFinishesTable).values({ name, glazingOk: b.glazingOk !== false, gloss: num01(b.gloss) ?? 0.3 }).returning();
  res.status(201).json(row);
}));
router.patch("/admin/surface-finishes/:id", requireAdminSession, wrap(async (req, res) => {
  const b = req.body ?? {};
  const f = clean({ name: b.name === undefined ? undefined : String(b.name).trim().slice(0, 80), glazingOk: typeof b.glazingOk === "boolean" ? b.glazingOk : undefined, gloss: num01(b.gloss) });
  const [row] = await db.update(surfaceFinishesTable).set(f).where(eq(surfaceFinishesTable.id, Number(req.params.id))).returning();
  res.json(row ?? {});
}));
router.delete("/admin/surface-finishes/:id", requireAdminSession, wrap(async (req, res) => {
  const id = Number(req.params.id);
  await db.update(artworksTable).set({ surfaceFinishId: null }).where(eq(artworksTable.surfaceFinishId, id));
  await db.delete(surfaceFinishesTable).where(eq(surfaceFinishesTable.id, id));
  res.json({ ok: true });
}));

// ── Admin: support (base type) properties ────────────────────────────────────
router.post("/admin/base-types", requireAdminSession, wrap(async (req, res) => {
  const b = req.body ?? {};
  const name = String(b.name ?? "").trim().slice(0, 80);
  if (name.length < 2) throw new Error("Give the support a name.");
  const [row] = await db.insert(baseTypesTable).values({ name, rigidity: oneOf(b.rigidity, RIGIDITY) ?? "rigid" }).returning();
  res.status(201).json(row);
}));
router.patch("/admin/base-types/:id", requireAdminSession, wrap(async (req, res) => {
  const b = req.body ?? {};
  const f = clean({
    rigidity: oneOf(b.rigidity, RIGIDITY),
    needsStretcher: typeof b.needsStretcher === "boolean" ? b.needsStretcher : undefined,
    needsGlazing: typeof b.needsGlazing === "boolean" ? b.needsGlazing : undefined,
    needsBacking: typeof b.needsBacking === "boolean" ? b.needsBacking : undefined,
    typicalThicknessMm: int(b.typicalThicknessMm, { max: 200, nullable: true }),
  });
  if (!Object.keys(f).length) return void res.status(400).json({ error: "Nothing to change." });
  const [row] = await db.update(baseTypesTable).set(f).where(eq(baseTypesTable.id, Number(req.params.id))).returning();
  res.json(row ?? {});
}));

// ── Admin: frame product details (a shop item of type "Frames") ──────────────
router.patch("/admin/shop/items/:id/frame", requireAdminSession, wrap(async (req, res) => {
  const b = req.body ?? {};
  const f = clean({
    frameProfileId: int(b.frameProfileId, { min: 1, nullable: true }),
    innerWidthMm: int(b.innerWidthMm, { min: 1, max: 10000, nullable: true }),
    innerHeightMm: int(b.innerHeightMm, { min: 1, max: 10000, nullable: true }),
    glazing: oneOf(b.glazing, GLAZING), backing: oneOf(b.backing, BACKING),
    matWidthMm: int(b.matWidthMm, { max: 300 }), matColourHex: hex(b.matColourHex),
    revealGapMm: int(b.revealGapMm, { max: 100, nullable: true }),
    pricePerMetre: b.pricePerMetre === undefined ? undefined : (b.pricePerMetre === null || b.pricePerMetre === "" ? null : toMoney(Number(b.pricePerMetre))),
  });
  if ((f.innerWidthMm == null) !== (f.innerHeightMm == null) && ("innerWidthMm" in f || "innerHeightMm" in f)) {
    throw new Error("Give both opening width and height, or leave both empty for made-to-measure.");
  }
  const [row] = await db.update(shopItemsTable).set(f as any).where(eq(shopItemsTable.id, Number(req.params.id))).returning();
  if (!row) return void res.status(404).json({ error: "Frame not found." });
  res.json(row);
}));

export default router;
