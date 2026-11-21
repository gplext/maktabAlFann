import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import { imageSize } from "./image-size";

/**
 * Every carousel on the site. The frame is measured on a typical laptop
 * screen (1440 × 900) so "page coverage" and "image coverage" are comparable.
 */
export type CarouselKind = "artwork" | "artist";
export type CarouselMode = "manual" | "latest" | "gallery" | "popularity";
export const MODES: CarouselMode[] = ["manual", "latest", "gallery", "popularity"];

export type CarouselDef = {
  key: string;
  name: string;
  page: string;
  kind: CarouselKind;
  /** Frame size in px on a 1440 × 900 laptop screen. */
  frame: { width: number; height: number };
  /** How the frame is sized, in words, for the admin page. */
  sizing: string;
  defaults: { mode: CarouselMode; poolSize: number; showCount: number };
  /**
   * Only paintings in landscape shape (wider than tall, see LANDSCAPE_MIN) may appear.
   * Artist carousels: each artist's picture is one of their landscape paintings.
   */
  landscapePaintingsOnly?: boolean;
};

export const SCREEN = { width: 1440, height: 900 };

export const CAROUSELS: CarouselDef[] = [
  {
    key: "home-hero",
    name: "Home page — main carousel",
    page: "/",
    kind: "artwork",
    frame: { width: 1440, height: Math.round(900 * 0.78) },
    sizing: "Full width · 78% of screen height on laptops (68% tablets, 55% phones)",
    defaults: { mode: "latest", poolSize: 15, showCount: 10 },
    landscapePaintingsOnly: true,
  },
  {
    key: "artists-featured",
    name: "Artists page — featured artists",
    page: "/artists",
    kind: "artist",
    frame: { width: 1440, height: Math.min(680, Math.max(460, Math.round(900 * 0.68))) },
    sizing: "Full width · 68% of screen height (min 460 px, max 680 px)",
    defaults: { mode: "popularity", poolSize: 15, showCount: 5 },
    // Each artist is shown with one of their landscape paintings; artists without one are left out.
    landscapePaintingsOnly: true,
  },
];

export const carouselDef = (key: string) => CAROUSELS.find((c) => c.key === key);

export type Candidate = {
  id: number;
  title: string;
  subtitle: string;
  imageUrl: string;
  theme?: string | null;
  artStyle?: string | null;
  score: number;
  /** Artwork's real width ÷ height (cm), when known. */
  realAspect?: number | null;
  /** Artist carousels: the picture is the artist's chosen slide painting (these artists go first). */
  featured?: boolean;
};

export type Ranked = Candidate & {
  width: number | null;
  height: number | null;
  aspect: number | null;
  /** Share of the frame's width the image fills when shown at full frame height (0–1). */
  coverage: number;
  /** 1 = 4:3, 2 = covers ≥ 80% of the width, 3 = anything else. */
  tier: 1 | 2 | 3;
};

const RATIO_4_3 = 4 / 3;
const RATIO_TOLERANCE = 0.05; // ±5% counts as 4:3
const WIDE_ENOUGH = 0.8;
/** Width ÷ height an image needs to count as landscape (5:4 or wider). */
export const LANDSCAPE_MIN = 1.25;
/**
 * Landscape = the picture is wide enough AND, when the painting's real size (cm) is known, the painting itself is.
 * (Some gallery pictures are padded to 4:3 around a tall painting, so the file alone can't be trusted.)
 */
export const isLandscape = (r: { aspect: number | null; realAspect?: number | null }) =>
  r.aspect !== null && r.aspect >= LANDSCAPE_MIN && (r.realAspect == null || r.realAspect >= LANDSCAPE_MIN);
/** SQL: width ÷ height of the artwork in cm, or NULL when its size isn't recorded. */
const REAL_ASPECT = (w: string) => sql.raw(`CASE WHEN ${w}.width_cm > 0 AND ${w}.height_cm > 0 THEN ${w}.width_cm::float / ${w}.height_cm END`);

/** Popularity of one artwork: sales count most, then enquiries, then carts; featured gets a nudge. */
const ARTWORK_SCORE = sql`(
  5 * (SELECT count(*) FROM order_line_items l WHERE l.artwork_id = a.id)
  + 3 * (SELECT count(*) FROM enquiries e
         CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.items) = 'array' THEN e.items ELSE '[]'::jsonb END) it
         WHERE it->>'artworkId' = a.id::text)
  + (SELECT count(*) FROM cart_items c WHERE c.artwork_id = a.id)
  + CASE WHEN a.is_featured THEN 2 ELSE 0 END
)`;

type Query = { mode: CarouselMode; galleryId?: number | null; search?: string; ids?: number[]; limit: number; paintingsOnly?: boolean };

export async function candidates(kind: CarouselKind, q: Query): Promise<Candidate[]> {
  const where: SQL[] = [];
  const like = q.search?.trim() ? `%${q.search.trim()}%` : null;

  if (kind === "artwork") {
    where.push(sql`a.status = 'approved' AND ar.is_verified = 'approved' AND a.image_url <> '' AND a.image_url NOT LIKE '%placehold.co%'`);
    if (q.mode === "gallery" && q.galleryId) {
      where.push(sql`(a.id IN (SELECT artwork_id FROM gallery_artworks WHERE gallery_id = ${q.galleryId})
                   OR a.artist_id IN (SELECT artist_id FROM gallery_artists WHERE gallery_id = ${q.galleryId}))`);
    }
    if (like) where.push(sql`(a.title ILIKE ${like} OR ar.name ILIKE ${like} OR a.theme ILIKE ${like} OR s.name ILIKE ${like})`);
    if (q.paintingsOnly) where.push(sql`a.art_category_id IN (SELECT id FROM art_categories WHERE lower(name) = 'paintings')`);
    if (q.ids) where.push(q.ids.length ? sql`a.id = ANY(${`{${q.ids.join(",")}}`}::int[])` : sql`false`);
    const order = q.mode === "popularity" ? sql`score DESC, a.id DESC` : sql`a.id DESC`;
    const res = await db.execute(sql`
      SELECT a.id, a.title, ar.name AS subtitle, a.image_url AS "imageUrl", a.theme, s.name AS "artStyle",
             ${ARTWORK_SCORE}::int AS score, ${REAL_ASPECT("a")} AS "realAspect"
      FROM artworks a
      JOIN artists ar ON ar.id = a.artist_id
      LEFT JOIN art_styles s ON s.id = a.art_style_id
      WHERE ${sql.join(where, sql` AND `)}
      ORDER BY ${order}
      LIMIT ${q.limit}`);
    return res.rows as Candidate[];
  }

  // An artist's picture: a real portrait, else their best public artwork (stock placeholders don't count).
  const realPhoto = sql`(ar.photo_url <> '' AND ar.photo_url !~* '(picsum\.photos|placehold\.co|placeholder)')`;
  const cover = sql`(SELECT w.image_url FROM artworks w WHERE w.artist_id = ar.id AND w.status = 'approved'
    AND w.image_url <> '' AND w.image_url NOT LIKE '%placehold.co%' ORDER BY w.is_featured DESC, w.id DESC LIMIT 1)`;
  where.push(sql`ar.is_verified = 'approved' AND (${realPhoto} OR ${cover} IS NOT NULL)
    AND EXISTS (SELECT 1 FROM artworks w2 WHERE w2.artist_id = ar.id AND w2.status = 'approved')`);
  if (q.mode === "gallery" && q.galleryId) {
    where.push(sql`ar.id IN (SELECT artist_id FROM gallery_artists WHERE gallery_id = ${q.galleryId})`);
  }
  if (like) where.push(sql`(ar.name ILIKE ${like} OR ar.country ILIKE ${like} OR ar.style ILIKE ${like})`);
  if (q.ids) where.push(q.ids.length ? sql`ar.id = ANY(${`{${q.ids.join(",")}}`}::int[])` : sql`false`);
  const order = q.mode === "popularity" ? sql`score DESC, ar.id DESC` : sql`ar.id DESC`;
  const res = await db.execute(sql`
    SELECT ar.id, ar.name AS title, ar.country AS subtitle,
           CASE WHEN ${realPhoto} THEN ar.photo_url ELSE ${cover} END AS "imageUrl",
           (SELECT count(*) FROM artworks w WHERE w.artist_id = ar.id AND w.status = 'approved')
           + coalesce((SELECT sum(${ARTWORK_SCORE}) FROM artworks a WHERE a.artist_id = ar.id AND a.status = 'approved'), 0)
           AS score
    FROM artists ar
    WHERE ${sql.join(where, sql` AND `)}
    ORDER BY ${order}
    LIMIT ${q.limit}`);
  const rows = (res.rows as Candidate[]).map((r) => ({ ...r, score: Number(r.score) }));
  if (!q.paintingsOnly) return rows;
  // Landscape-only: swap the portrait for the artist's landscape painting, dropping artists who have none.
  const covers = await landscapeCovers(rows.map((r) => r.id));
  return rows.filter((r) => covers.has(r.id)).map((r) => ({ ...r, ...covers.get(r.id)! }));
}

/** Same as migrations/migration-12-artist-slide.sql; run on start-up. */
export function ensureArtistSlideColumn(): Promise<unknown> {
  return db.execute(sql`ALTER TABLE artworks ADD COLUMN IF NOT EXISTS artist_slide boolean NOT NULL DEFAULT false`);
}

/** Wider than this is a panorama strip: it would be cropped to a sliver on a full-screen slide. */
const MAX_SLIDE_ASPECT = 2.3;

/**
 * For each artist, the landscape painting their slide shows: the one marked as their slide
 * (artworks.artist_slide) first, otherwise the sharpest (widest in pixels) of their landscape
 * paintings that isn't a panorama strip.
 */
type Cover = { imageUrl: string; realAspect: number | null; featured: boolean };
async function landscapeCovers(artistIds: number[]): Promise<Map<number, Cover>> {
  const out = new Map<number, Cover & { px: number }>();
  if (artistIds.length === 0) return out;
  const res = await db.execute(sql`
    SELECT w.artist_id AS "artistId", w.image_url AS "imageUrl", ${REAL_ASPECT("w")} AS "realAspect", w.artist_slide AS featured
    FROM artworks w
    WHERE w.artist_id = ANY(${`{${artistIds.join(",")}}`}::int[]) AND w.status = 'approved'
      AND w.image_url <> '' AND w.image_url NOT LIKE '%placehold.co%'
      AND w.art_category_id IN (SELECT id FROM art_categories WHERE lower(name) = 'paintings')
    ORDER BY w.artist_id, w.artist_slide DESC, w.id DESC`);
  for (const r of res.rows as { artistId: number; imageUrl: string; realAspect: number | null; featured: boolean }[]) {
    const prev = out.get(r.artistId);
    if (prev?.featured) continue; // rows come featured first
    const realAspect = r.realAspect == null ? null : Number(r.realAspect);
    if (realAspect !== null && (realAspect < LANDSCAPE_MIN || realAspect > MAX_SLIDE_ASPECT)) continue; // skip without reading the file
    const s = await imageSize(r.imageUrl);
    if (!s || s.width / s.height > MAX_SLIDE_ASPECT || !isLandscape({ aspect: s.width / s.height, realAspect })) continue;
    if (!prev || r.featured || s.width > prev.px) out.set(r.artistId, { imageUrl: r.imageUrl, realAspect, featured: !!r.featured, px: s.width });
  }
  return new Map([...out].map(([id, { px: _px, ...c }]) => [id, c]));
}

/** Adds pixel size, frame coverage and tier to each candidate (order kept). */
export async function measure(def: CarouselDef, list: Candidate[]): Promise<Ranked[]> {
  const frameAspect = def.frame.width / def.frame.height;
  const sizes = await Promise.all(list.map((c) => imageSize(c.imageUrl)));
  return list.map((c, i) => {
    const s = sizes[i];
    const aspect = s ? s.width / s.height : null;
    const coverage = aspect ? Math.min(1, aspect / frameAspect) : 0;
    const is43 = aspect !== null && Math.abs(aspect - RATIO_4_3) / RATIO_4_3 <= RATIO_TOLERANCE;
    const tier: 1 | 2 | 3 = is43 ? 1 : coverage >= WIDE_ENOUGH ? 2 : 3;
    return { ...c, width: s?.width ?? null, height: s?.height ?? null, aspect, coverage, tier };
  });
}

/**
 * The selection algorithm.
 * 1. Take candidates in the mode's order (newest / most popular / the gallery's).
 *    Latest and popularity look at a window 3× the pool size, so the shape rules
 *    can choose without drifting far from "latest" or "popular".
 * 2. Pick 4:3 images first, then images that fill ≥ 80% of the frame's width,
 *    then the rest by how much width they fill. Within a tier the mode's order holds.
 */
export async function generatePool(def: CarouselDef, mode: CarouselMode, galleryId: number | null, poolSize: number): Promise<Ranked[]> {
  const strict = !!def.landscapePaintingsOnly;
  // Landscape paintings are a minority, so look further back for them.
  const windowSize = mode === "gallery" ? 1000 : Math.max(poolSize * (strict ? 12 : 3), strict ? 200 : 30);
  let list = await measure(def, await candidates(def.kind, { mode, galleryId, limit: windowSize, paintingsOnly: strict }));
  if (strict) list = list.filter(isLandscape);
  const byOrder = (t: 1 | 2) => list.filter((r) => r.tier === t);
  const rest = list.filter((r) => r.tier === 3).sort((a, b) => b.coverage - a.coverage);
  const ranked = [...byOrder(1), ...byOrder(2), ...rest];
  // Artists with a chosen slide painting come first ("artistSlide" in imported data).
  return [...ranked.filter((r) => r.featured), ...ranked.filter((r) => !r.featured)].slice(0, poolSize);
}

/** Resolve saved ids to public items, keeping the saved order and dropping anything no longer public. */
export async function resolveIds(def: CarouselDef, ids: number[]): Promise<Candidate[]> {
  if (ids.length === 0) return [];
  const rows = await candidates(def.kind, { mode: "latest", ids, limit: ids.length });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is Candidate => !!r);
}

/** What a carousel may actually show: for landscape-only carousels, drops portrait/square images and non-paintings. */
export async function showable(def: CarouselDef, list: Candidate[]): Promise<Candidate[]> {
  if (!def.landscapePaintingsOnly || list.length === 0) return list;
  const allowed = new Map((await candidates(def.kind, { mode: "latest", ids: list.map((c) => c.id), limit: list.length, paintingsOnly: true })).map((c) => [c.id, c]));
  // Artists get the landscape painting picked for them; artworks keep their own image.
  const kept = list.filter((c) => allowed.has(c.id)).map((c) => (def.kind === "artist" ? allowed.get(c.id)! : c));
  const measured = await measure(def, kept);
  return measured.filter(isLandscape);
}
