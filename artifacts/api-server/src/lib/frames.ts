import {
  db, artworksTable, shopItemsTable, frameProfilesTable, frameCompatibilityTable, baseTypesTable, surfaceFinishesTable,
  type FrameProfile, type FrameCompatibility, type ShopItem,
} from "@workspace/db";
import { inArray } from "drizzle-orm";

/**
 * Frame maths. All sizes in millimetres.
 *
 *   lip      = profile.rebate_width (0 when there is a shadow gap — the frame doesn't touch the canvas)
 *   opening  = art + 2×mat + 2×gap − 2×lip          (a ready-made frame: its own opening size)
 *   outer    = opening + 2×face width
 *   depth    = max(frame depth, art depth + backing)
 */

const FIT_TOLERANCE_MM = 5;       // ready-made frame opening may differ by this much
const BACKING_MM: Record<string, number> = { none: 0, hardboard: 3, foam_board: 5 };
const GLAZING_MM: Record<string, number> = { none: 0, glass: 2, acrylic: 3, anti_reflective: 2 };

export type ArtworkForFraming = {
  id: number; title: string; artCategoryId: number; baseTypeId: number | null; surfaceFinishId: number | null;
  widthMm: number | null; heightMm: number | null; depthMm: number | null;
  widthCm: number | null; heightCm: number | null; depthCm: number | null; weightGrams: number | null;
};
type Base = typeof baseTypesTable.$inferSelect;
type Finish = typeof surfaceFinishesTable.$inferSelect;

export type FrameSpec = {
  shopItemId: number; name: string; profileId: number | null; profileName: string | null; style: string | null;
  madeToMeasure: boolean;
  artwork: { widthMm: number; heightMm: number; depthMm: number } | null;
  matWidthMm: number; matColourHex: string; revealGapMm: number; revealColourHex: string; lipMm: number;
  faceWidthMm: number | null; frameDepthMm: number | null;
  glazing: string; backing: string;
  opening: { widthMm: number; heightMm: number } | null;
  outer: { widthMm: number; heightMm: number; depthMm: number } | null;
  look: { colourHex: string; metalness: number; roughness: number; profileShape: string; textureUrl: string | null } | null;
  price: number;
};
export type FrameEvaluation = { compatible: boolean; measured: boolean; reasons: string[]; spec: FrameSpec };

/** Exact size of the artwork; falls back to cm × 10 and to the support's typical thickness. */
export function artworkSizeMm(a: ArtworkForFraming, base: Base | null) {
  const w = a.widthMm ?? (a.widthCm != null ? a.widthCm * 10 : null);
  const h = a.heightMm ?? (a.heightCm != null ? a.heightCm * 10 : null);
  const d = a.depthMm ?? (a.depthCm != null ? a.depthCm * 10 : null) ?? base?.typicalThicknessMm ?? 2;
  return w && h ? { widthMm: w, heightMm: h, depthMm: d } : null;
}

const round = (n: number) => Math.round(n);
/** Shop items of type "Frames" (any capitalisation, singular or plural). */
export const isFrameType = (t: string) => /^frames?$/i.test(t.trim());

export function evaluateFrame(
  art: ArtworkForFraming, item: ShopItem, profile: FrameProfile | null,
  rules: FrameCompatibility[], base: Base | null, finish: Finish | null,
): FrameEvaluation {
  const reasons: string[] = [];
  const size = artworkSizeMm(art, base);
  const madeToMeasure = item.innerWidthMm == null || item.innerHeightMm == null;
  const gap = item.revealGapMm ?? profile?.revealGapMm ?? 0;
  const mat = item.matWidthMm ?? 0;
  const lip = gap > 0 ? 0 : (profile?.rebateWidthMm ?? 0);
  const backingMm = BACKING_MM[item.backing] ?? 0;
  const glazingMm = GLAZING_MM[item.glazing] ?? 0;

  // ── Rules: category / support ──
  if (profile) {
    const mine = rules.filter((r) => r.frameProfileId === profile.id);
    const matches = (r: FrameCompatibility) =>
      (r.artCategoryId == null || r.artCategoryId === art.artCategoryId) &&
      (r.baseTypeId == null || r.baseTypeId === art.baseTypeId);
    if (mine.some((r) => !r.allow && matches(r))) reasons.push("Not suitable for this type of artwork.");
    const allows = mine.filter((r) => r.allow);
    if (allows.length && !allows.some(matches)) reasons.push("Not suitable for this type of artwork.");
  }
  // ── Support needs ──
  if (base?.needsGlazing && item.glazing === "none") reasons.push(`${base.name} needs a frame with glass or acrylic.`);
  if (base?.needsBacking && item.backing === "none") reasons.push(`${base.name} needs a frame with a backing board.`);
  if (base?.needsStretcher && item.backing === "none") reasons.push(`${base.name} must be stretched or mounted first.`);
  if (gap > 0 && base?.rigidity === "loose_sheet") reasons.push("A shadow-gap frame shows the edges — not for loose sheets.");
  if (finish && !finish.glazingOk && item.glazing !== "none") reasons.push(`${finish.name} must not be placed behind glass.`);

  // ── Size ──
  let opening: FrameSpec["opening"] = null;
  let outer: FrameSpec["outer"] = null;
  if (size) {
    const needW = size.widthMm + 2 * mat + 2 * gap - 2 * lip;
    const needH = size.heightMm + 2 * mat + 2 * gap - 2 * lip;
    if (madeToMeasure) {
      opening = { widthMm: needW, heightMm: needH };
    } else {
      const iw = item.innerWidthMm!, ih = item.innerHeightMm!;
      const fits = (a: number, b: number) => Math.abs(a - iw) <= FIT_TOLERANCE_MM && Math.abs(b - ih) <= FIT_TOLERANCE_MM;
      if (fits(needW, needH)) opening = { widthMm: iw, heightMm: ih };
      else if (fits(needH, needW)) opening = { widthMm: ih, heightMm: iw };   // frame used the other way round
      else { opening = { widthMm: iw, heightMm: ih }; reasons.push(`Opening ${iw}×${ih} mm doesn't fit this artwork (needs about ${needW}×${needH} mm).`); }
    }
    if (profile) {
      outer = {
        widthMm: opening.widthMm + 2 * profile.faceWidthMm,
        heightMm: opening.heightMm + 2 * profile.faceWidthMm,
        depthMm: Math.max(profile.depthMm, size.depthMm + backingMm + glazingMm),
      };
      const inside = size.depthMm + backingMm + glazingMm;
      if (inside > profile.rebateDepthMm && gap === 0) reasons.push(`Artwork is too deep for this moulding (${inside} mm needed, ${profile.rebateDepthMm} mm available).`);
      if (gap > 0 && size.depthMm > profile.rebateDepthMm) reasons.push(`Canvas is deeper than the floater (${size.depthMm} mm vs ${profile.rebateDepthMm} mm).`);
      if (profile.maxLongEdgeMm && Math.max(outer.widthMm, outer.heightMm) > profile.maxLongEdgeMm) reasons.push(`Too large for this moulding (max ${profile.maxLongEdgeMm} mm).`);
    }
  } else if (!madeToMeasure) {
    reasons.push("The artwork's size isn't recorded, so a ready-made frame can't be checked.");
  }
  if (profile?.maxWeightG && art.weightGrams && art.weightGrams > profile.maxWeightG) reasons.push(`Too heavy for this moulding (max ${(profile.maxWeightG / 1000).toFixed(1)} kg).`);

  // ── Price: made-to-measure adds moulding length × price per metre ──
  let price = Number(item.price);
  if (madeToMeasure && item.pricePerMetre != null && outer) {
    const metres = (2 * (outer.widthMm + outer.heightMm)) / 1000;
    price = round(price + metres * Number(item.pricePerMetre));
  }

  return {
    compatible: reasons.length === 0,
    measured: Boolean(profile),
    reasons: [...new Set(reasons)],
    spec: {
      shopItemId: item.id, name: item.name, profileId: profile?.id ?? null, profileName: profile?.name ?? null, style: profile?.style ?? null,
      madeToMeasure, artwork: size, matWidthMm: mat, matColourHex: item.matColourHex, revealGapMm: gap,
      revealColourHex: profile?.revealColourHex ?? "#111111", lipMm: lip,
      faceWidthMm: profile?.faceWidthMm ?? null, frameDepthMm: profile?.depthMm ?? null,
      glazing: item.glazing, backing: item.backing, opening: profile ? opening : null, outer,
      look: profile ? { colourHex: profile.colourHex, metalness: profile.metalness, roughness: profile.roughness, profileShape: profile.profileShape, textureUrl: profile.textureUrl } : null,
      price,
    },
  };
}

/** Loads everything needed and evaluates every active frame for the given artworks. */
export async function framesForArtworks(artworkIds: number[], onlyItemIds?: number[]) {
  const out = new Map<number, FrameEvaluation[]>();
  if (!artworkIds.length) return out;
  const arts = await db.select({
    id: artworksTable.id, title: artworksTable.title, artCategoryId: artworksTable.artCategoryId,
    baseTypeId: artworksTable.baseTypeId, surfaceFinishId: artworksTable.surfaceFinishId,
    widthMm: artworksTable.widthMm, heightMm: artworksTable.heightMm, depthMm: artworksTable.depthMm,
    widthCm: artworksTable.widthCm, heightCm: artworksTable.heightCm, depthCm: artworksTable.depthCm,
    weightGrams: artworksTable.weightGrams,
  }).from(artworksTable).where(inArray(artworksTable.id, artworkIds));
  const items = (await db.select().from(shopItemsTable))
    .filter((i) => isFrameType(i.type) && i.status === "active" && (!onlyItemIds || onlyItemIds.includes(i.id)));
  const profiles = new Map((await db.select().from(frameProfilesTable)).map((p) => [p.id, p]));
  const rules = await db.select().from(frameCompatibilityTable);
  const bases = new Map((await db.select().from(baseTypesTable)).map((b) => [b.id, b]));
  const finishes = new Map((await db.select().from(surfaceFinishesTable)).map((f) => [f.id, f]));
  for (const a of arts) {
    const base = a.baseTypeId != null ? bases.get(a.baseTypeId) ?? null : null;
    const finish = a.surfaceFinishId != null ? finishes.get(a.surfaceFinishId) ?? null : null;
    out.set(a.id, items.map((i) => {
      const profile = i.frameProfileId != null ? profiles.get(i.frameProfileId) ?? null : null;
      if (profile && !profile.active) return { compatible: false, measured: true, reasons: ["This moulding is not available."], spec: evaluateFrame(a, i, profile, rules, base, finish).spec };
      return evaluateFrame(a, i, profile, rules, base, finish);
    }));
  }
  return out;
}
