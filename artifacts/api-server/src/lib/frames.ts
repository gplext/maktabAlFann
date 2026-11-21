import {
  db, artworksTable, artCategoriesTable, shopItemsTable, frameProfilesTable,
  type FrameProfile, type ShopItem,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

/**
 * Frames, kept simple. A frame is a shop item of type "Frames" with a few choices:
 *   finish  (gold, black, white, walnut, natural wood, silver)
 *   width   (thin, standard, wide)
 *   mount   (none, white, cream)
 *   glass   (yes / no)
 *   price   (fixed)
 * Every frame is made to measure for the painting, so it fits any artwork whose size is known.
 * Sculptures and installations are never framed. All sizes in millimetres.
 *
 *   opening = artwork + 2 × mount − 2 × lip      (the lip hides 5 mm of the artwork's edge)
 *   outer   = opening + 2 × frame width
 * Frames made before this (e.g. "Wide Frame", "Brown Croc Leather Frame") keep their own look.
 */

export const FINISHES = {
  gold:    { label: "Gold",         colourHex: "#B8893A", metalness: 1,    roughness: 0.32, profileShape: "ornate",  material: "wood" },
  black:   { label: "Black",        colourHex: "#141414", metalness: 0,    roughness: 0.38, profileShape: "flat",    material: "wood" },
  white:   { label: "White",        colourHex: "#EFEDE7", metalness: 0,    roughness: 0.45, profileShape: "flat",    material: "wood" },
  walnut:  { label: "Walnut",       colourHex: "#5B3A24", metalness: 0,    roughness: 0.5,  profileShape: "rounded", material: "wood" },
  natural: { label: "Natural wood", colourHex: "#C49A64", metalness: 0,    roughness: 0.55, profileShape: "flat",    material: "wood" },
  silver:  { label: "Silver",       colourHex: "#C7CACF", metalness: 1,    roughness: 0.28, profileShape: "bevel",   material: "metal" },
} as const;
export type FinishKey = keyof typeof FINISHES;
export const WIDTHS = {
  thin:     { label: "Thin",     faceWidthMm: 20, depthMm: 25 },
  standard: { label: "Standard", faceWidthMm: 40, depthMm: 32 },
  wide:     { label: "Wide",     faceWidthMm: 70, depthMm: 40 },
} as const;
export type WidthKey = keyof typeof WIDTHS;
export const MOUNTS = {
  none:  { label: "No mount", matWidthMm: 0,  matColourHex: "#F6F4EE" },
  white: { label: "White",    matWidthMm: 50, matColourHex: "#F6F4EE" },
  cream: { label: "Cream",    matWidthMm: 50, matColourHex: "#ECE2CB" },
} as const;
export type MountKey = keyof typeof MOUNTS;

const LIP_MM = 5;

/** Which preset a saved frame matches ("custom" = an older frame with its own look, kept as it is). */
export function finishOf(p: Pick<FrameProfile, "colourHex"> | null): FinishKey | "custom" {
  if (!p) return "custom";
  const hit = (Object.keys(FINISHES) as FinishKey[]).find((k) => FINISHES[k].colourHex.toLowerCase() === p.colourHex.toLowerCase());
  return hit ?? "custom";
}
export function widthOf(p: Pick<FrameProfile, "faceWidthMm"> | null): WidthKey {
  const f = p?.faceWidthMm ?? 40;
  return f <= 28 ? "thin" : f <= 55 ? "standard" : "wide";
}
export function mountOf(i: Pick<ShopItem, "matWidthMm" | "matColourHex">): MountKey {
  if (!i.matWidthMm) return "none";
  return i.matColourHex.toLowerCase() === MOUNTS.cream.matColourHex.toLowerCase() ? "cream" : "white";
}

export type ArtworkForFraming = {
  id: number; title: string; category: string | null;
  widthMm: number | null; heightMm: number | null; depthMm: number | null;
  widthCm: number | null; heightCm: number | null; depthCm: number | null;
};

export type FrameSpec = {
  shopItemId: number; name: string; profileId: number | null; profileName: string | null; style: string | null;
  madeToMeasure: boolean;
  artwork: { widthMm: number; heightMm: number; depthMm: number } | null;
  matWidthMm: number; matColourHex: string; revealGapMm: number; revealColourHex: string; lipMm: number;
  faceWidthMm: number | null; frameDepthMm: number | null;
  glazing: string; backing: string;
  opening: { widthMm: number; heightMm: number } | null;
  outer: { widthMm: number; heightMm: number; depthMm: number } | null;
  look: { finish: FinishKey | "custom"; colourHex: string; metalness: number; roughness: number; profileShape: string; textureUrl: string | null } | null;
  price: number;
};
export type FrameEvaluation = { compatible: boolean; measured: boolean; reasons: string[]; spec: FrameSpec };

/** Exact size of the artwork (mm, else cm × 10); canvases default to 20 mm deep. */
export function artworkSizeMm(a: ArtworkForFraming) {
  const w = a.widthMm ?? (a.widthCm != null ? a.widthCm * 10 : null);
  const h = a.heightMm ?? (a.heightCm != null ? a.heightCm * 10 : null);
  const d = a.depthMm ?? (a.depthCm != null ? a.depthCm * 10 : null) ?? 20;
  return w && h ? { widthMm: w, heightMm: h, depthMm: d } : null;
}

/** Shop items of type "Frames" (any capitalisation, singular or plural). */
export const isFrameType = (t: string) => /^frames?$/i.test(t.trim());
const NOT_FRAMED = /sculpt|install/i;

export function evaluateFrame(art: ArtworkForFraming, item: ShopItem, profile: FrameProfile | null): FrameEvaluation {
  const reasons: string[] = [];
  const size = artworkSizeMm(art);
  if (art.category && NOT_FRAMED.test(art.category)) reasons.push(`${art.category} aren't framed.`);
  if (!size) reasons.push("The artwork's size isn't recorded, so the frame can't be cut to measure.");
  if (!profile) reasons.push("This frame isn't set up yet (Admin → Frames).");
  else if (!profile.active) reasons.push("This frame is not available.");

  const face = profile?.faceWidthMm ?? null;
  const mat = item.matWidthMm ?? 0;
  const lip = LIP_MM;
  let opening: FrameSpec["opening"] = null;
  let outer: FrameSpec["outer"] = null;
  if (size && profile) {
    opening = { widthMm: size.widthMm + 2 * mat - 2 * lip, heightMm: size.heightMm + 2 * mat - 2 * lip };
    outer = { widthMm: opening.widthMm + 2 * face!, heightMm: opening.heightMm + 2 * face!, depthMm: Math.max(profile.depthMm, size.depthMm + 5) };
  }

  const price = Number(item.price);

  return {
    compatible: reasons.length === 0,
    measured: Boolean(profile),
    reasons,
    spec: {
      shopItemId: item.id, name: item.name, profileId: profile?.id ?? null, profileName: profile?.name ?? null, style: profile ? widthOf(profile) : null,
      madeToMeasure: true, artwork: size, matWidthMm: mat, matColourHex: item.matColourHex, revealGapMm: 0, revealColourHex: "#111111", lipMm: lip,
      faceWidthMm: face, frameDepthMm: profile?.depthMm ?? null,
      glazing: item.glazing, backing: item.backing, opening, outer,
      look: profile ? { finish: finishOf(profile), colourHex: profile.colourHex, metalness: profile.metalness, roughness: profile.roughness, profileShape: profile.profileShape, textureUrl: profile.textureUrl } : null,
      price,
    },
  };
}

const norm = (n: string) => n.toLowerCase().replace(/\bframes?\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** A look for an older frame that has no moulding saved: guessed from its name ("gold", "black", "thin"…). */
function guessedProfile(item: ShopItem): FrameProfile {
  const n = item.name.toLowerCase();
  const finish: FinishKey = /gold|gilt/.test(n) ? "gold" : /silver|chrome|steel/.test(n) ? "silver" : /white|ivory/.test(n) ? "white"
    : /walnut|brown|teak|sheesham|mahogany|enclos/.test(n) ? "walnut" : /oak|natural|wood|pine|ash/.test(n) ? "natural" : "black";
  const width: WidthKey = /thin|slim|float/.test(n) ? "thin" : /wide|broad|ornate/.test(n) ? "wide" : "standard";
  const f = FINISHES[finish], w = WIDTHS[width];
  return {
    id: 0, name: item.name, style: width, material: f.material, profileShape: f.profileShape, faceWidthMm: w.faceWidthMm, depthMm: w.depthMm,
    rebateWidthMm: 5, rebateDepthMm: w.depthMm - 5, revealGapMm: 0, revealColourHex: "#111111", maxLongEdgeMm: null, maxWeightG: null,
    colourHex: f.colourHex, metalness: f.metalness, roughness: f.roughness, textureUrl: null, active: true, displayOrder: 0,
  };
}

/** The moulding for a frame: its own, else one with the same name, else a look guessed from the name. */
export function profileFor(item: ShopItem, profiles: FrameProfile[]): { profile: FrameProfile; saved: boolean } {
  const own = item.frameProfileId != null ? profiles.find((p) => p.id === item.frameProfileId) : undefined;
  if (own) return { profile: own, saved: true };
  const named = profiles.find((p) => norm(p.name) === norm(item.name));
  if (named) return { profile: named, saved: true };
  return { profile: guessedProfile(item), saved: false };
}

/** Evaluates every active frame for the given artworks. */
export async function framesForArtworks(artworkIds: number[], onlyItemIds?: number[]) {
  const out = new Map<number, FrameEvaluation[]>();
  if (!artworkIds.length) return out;
  const arts = await db.select({
    id: artworksTable.id, title: artworksTable.title, category: artCategoriesTable.name,
    widthMm: artworksTable.widthMm, heightMm: artworksTable.heightMm, depthMm: artworksTable.depthMm,
    widthCm: artworksTable.widthCm, heightCm: artworksTable.heightCm, depthCm: artworksTable.depthCm,
  }).from(artworksTable)
    .leftJoin(artCategoriesTable, eq(artCategoriesTable.id, artworksTable.artCategoryId))
    .where(inArray(artworksTable.id, artworkIds));
  const items = (await db.select().from(shopItemsTable))
    .filter((i) => isFrameType(i.type) && i.status === "active" && (!onlyItemIds || onlyItemIds.includes(i.id)));
  const profiles = await db.select().from(frameProfilesTable);
  for (const a of arts) {
    out.set(a.id, items.map((i) => evaluateFrame(a, i, profileFor(i, profiles).profile)));
  }
  return out;
}
