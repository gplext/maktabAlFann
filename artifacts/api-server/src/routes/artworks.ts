import { Router, type IRouter } from "express";
import { artworkAvailability } from "../lib/orders";
import { eq, and, inArray, sql, desc, asc, type SQL } from "drizzle-orm";
import {
  db,
  artworksTable,
  artistsTable,
  suppliersTable,
  storageLocationsTable,
  tagsTable,
  artworkTagsTable,
  artCategoriesTable,
  artStylesTable,
  artSubcategoriesTable,
  sizesTable,
  techniquesTable,
  baseTypesTable,
  paintMaterialsTable,
} from "@workspace/db";
import {
  ListArtworksQueryParams,
  GetArtworkParams,
  ListArtworksResponse,
  GetArtworkResponse,
  GetFeaturedArtworksResponse,
  GetArtworkFiltersResponse,
} from "@workspace/api-zod";
import { formatZodError } from "../lib/validation";
import { artworkSearch, didYouMean, searchWords } from "../lib/search";

const router: IRouter = Router();

/**
 * Only approved work by approved artists is ever public.
 * Every listing query starts from this.
 */
const PUBLIC_ONLY = and(
  eq(artworksTable.status, "approved"),
  eq(artistsTable.isVerified, "approved"),
);

/**
 * Card-level projection.
 *
 * Classification used to be free text on `artworks`. It is now a set of foreign
 * keys, so each field is returned as a pair: `xxxId` for filtering and forms,
 * and the resolved name for display. The client never has to hold a lookup
 * table to render a card.
 */
const ARTWORK_CARD = {
  id: artworksTable.id,
  title: artworksTable.title,
  artistId: artworksTable.artistId,
  artistName: artistsTable.name,
  nationality: artistsTable.country,

  artCategoryId: artworksTable.artCategoryId,
  artCategory: artCategoriesTable.name,
  artStyleId: artworksTable.artStyleId,
  artStyle: artStylesTable.name,
  sizeId: artworksTable.sizeId,
  size: sizesTable.code,
  sizeLabel: sizesTable.label,

  theme: artworksTable.theme,
  year: artworksTable.year,
  imageUrl: artworksTable.imageUrl,
  thumbnailUrl: artworksTable.thumbnailUrl,
  shortDescription: artworksTable.shortDescription,
  isFeatured: artworksTable.isFeatured,
  specialtyType: artworksTable.specialtyType,
  displayPrice: artworksTable.displayPrice,
} as const;

/** `artType` is a deprecated alias of `artStyle` — see api-zod for why. */
function withLegacyAlias<T extends { artStyle: string | null }>(row: T) {
  return { ...row, artType: row.artStyle };
}

/** Every card query needs the same four joins. */
function cardQuery() {
  return db
    .select(ARTWORK_CARD)
    .from(artworksTable)
    .innerJoin(artistsTable, eq(artworksTable.artistId, artistsTable.id))
    .innerJoin(artCategoriesTable, eq(artworksTable.artCategoryId, artCategoriesTable.id))
    .leftJoin(artStylesTable, eq(artworksTable.artStyleId, artStylesTable.id))
    .leftJoin(sizesTable, eq(artworksTable.sizeId, sizesTable.id));
}

router.get("/artworks", async (req, res): Promise<void> => {
  const parsed = ListArtworksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const {
    nationality, theme, artistId, featured, specialtyType, limit, offset,
    artCategoryId, artCategory, artStyleId, artStyle, sizeId, size, artType,
    baseTypeId, paintMaterialId, q,
  } = parsed.data;

  const conditions: SQL[] = [PUBLIC_ONLY!];
  const search = await artworkSearch(q);
  if (search) conditions.push(search.where);

  if (theme) conditions.push(eq(artworksTable.theme, theme));
  if (artistId != null) conditions.push(eq(artworksTable.artistId, artistId));
  if (featured != null) conditions.push(eq(artworksTable.isFeatured, featured));
  if (specialtyType) conditions.push(eq(artworksTable.specialtyType, specialtyType));
  if (nationality) conditions.push(eq(artistsTable.country, nationality));

  // Filter by id when given one, otherwise by display name — so both a modern
  // client and the older name-based UI keep working.
  if (artCategoryId != null) conditions.push(eq(artworksTable.artCategoryId, artCategoryId));
  else if (artCategory) conditions.push(eq(artCategoriesTable.name, artCategory));

  const styleName = artStyle ?? artType; // artType is the deprecated alias
  if (artStyleId != null) conditions.push(eq(artworksTable.artStyleId, artStyleId));
  else if (styleName) conditions.push(eq(artStylesTable.name, styleName));

  if (sizeId != null) conditions.push(eq(artworksTable.sizeId, sizeId));
  else if (size) conditions.push(eq(sizesTable.code, size));

  if (baseTypeId != null) conditions.push(eq(artworksTable.baseTypeId, baseTypeId));
  if (paintMaterialId != null) conditions.push(eq(artworksTable.paintMaterialId, paintMaterialId));

  const rows = await cardQuery()
    .where(and(...conditions))
    // Best match first when searching; then a fixed order, so pages (limit/offset) never repeat or skip a work.
    .orderBy(...(search ? [desc(search.rank), asc(artworksTable.id)] : [asc(artworksTable.id)]))
    .limit(limit ?? 100)
    .offset(offset ?? 0);

  const held = await artworkAvailability(rows.map((r) => r.id));
  res.json(ListArtworksResponse.parse(rows.map((r) => ({ ...withLegacyAlias(r), availability: held.get(r.id) ?? "available" }))));
});

/**
 * Suggestions while typing in the /art search box: matching artworks, artists,
 * styles and art types — plus "Did you mean…" when no artwork matches.
 */
router.get("/artworks/suggest", async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "").slice(0, 100);
  const words = searchWords(q);
  if (words.length === 0) return void res.json({ artworks: [], artists: [], styles: [], categories: [], didYouMean: null });
  const search = (await artworkSearch(q))!;
  const like = `%${q.trim().replace(/[%_\\]/g, "\\$&")}%`;

  const [artworks, artists, styles, categories] = await Promise.all([
    cardQuery().where(and(PUBLIC_ONLY, search.where)).orderBy(desc(search.rank), asc(artworksTable.id)).limit(6),
    db.select({ id: artistsTable.id, name: artistsTable.name, photoUrl: artistsTable.photoUrl })
      .from(artistsTable)
      .where(and(eq(artistsTable.isVerified, "approved"), sql`${artistsTable.name} ILIKE ${like}`,
        sql`EXISTS (SELECT 1 FROM artworks w WHERE w.artist_id = ${artistsTable.id} AND w.status = 'approved')`))
      .orderBy(artistsTable.name).limit(4),
    db.select({ id: artStylesTable.id, name: artStylesTable.name }).from(artStylesTable)
      .where(sql`${artStylesTable.name} ILIKE ${like}`).limit(4),
    db.select({ id: artCategoriesTable.id, name: artCategoriesTable.name }).from(artCategoriesTable)
      .where(sql`${artCategoriesTable.name} ILIKE ${like}`).limit(4),
  ]);

  res.set("Cache-Control", "no-cache");
  res.json({
    artworks: artworks.map((a) => ({ id: a.id, title: a.title, artistName: a.artistName, imageUrl: a.thumbnailUrl || a.imageUrl, artStyle: a.artStyle })),
    artists,
    styles,
    categories,
    didYouMean: artworks.length === 0 ? await didYouMean(q, PUBLIC_ONLY!) : null,
  });
});

router.get("/artworks/featured", async (_req, res): Promise<void> => {
  const rows = await cardQuery()
    .where(and(PUBLIC_ONLY, eq(artworksTable.isFeatured, true)))
    .limit(6);

  const held = await artworkAvailability(rows.map((r) => r.id));
  res.json(GetFeaturedArtworksResponse.parse(rows.map((r) => ({ ...withLegacyAlias(r), availability: held.get(r.id) ?? "available" }))));
});

/**
 * Filter options for the /art sidebar.
 *
 * Categories, styles and sizes come from the lookup tables with a live count,
 * so the sidebar can grey out or hide an empty option instead of offering a
 * filter that returns nothing — which is exactly what used to happen when
 * artworks were tagged 'Handicraft' and the category list said 'Paintings'.
 */
/**
 * Filter options for the /art sidebar, with live counts.
 *
 * Counts are "faceted": each option's number is how many public artworks you
 * would see if you picked it, given the filters already chosen in the OTHER
 * groups (?artCategoryId=…&artStyleId=…&sizeId=…&baseTypeId=…&paintMaterialId=…).
 * A group never narrows its own counts, so you can still see its alternatives.
 */
type Facet = "artCategoryId" | "artStyleId" | "sizeId" | "baseTypeId" | "paintMaterialId";
router.get("/artworks/filters", async (req, res): Promise<void> => {
  const search = await artworkSearch(typeof req.query.q === "string" ? req.query.q : undefined);
  const chosen: Partial<Record<Facet, number>> = {};
  for (const k of ["artCategoryId", "artStyleId", "sizeId", "baseTypeId", "paintMaterialId"] as Facet[]) {
    const n = Number(req.query[k]);
    if (Number.isInteger(n) && n > 0) chosen[k] = n;
  }
  const facetColumn = {
    artCategoryId: artworksTable.artCategoryId,
    artStyleId: artworksTable.artStyleId,
    sizeId: artworksTable.sizeId,
    baseTypeId: artworksTable.baseTypeId,
    paintMaterialId: artworksTable.paintMaterialId,
  };
  /** Public artworks narrowed by every chosen filter except `except`. */
  const scoped = (except: Facet | null) => {
    const conds: SQL[] = [PUBLIC_ONLY!];
    if (search) conds.push(search.where);
    for (const [k, v] of Object.entries(chosen) as [Facet, number][]) {
      if (k !== except) conds.push(eq(facetColumn[k], v));
    }
    return db
      .select({
        artCategoryId: artworksTable.artCategoryId,
        artStyleId: artworksTable.artStyleId,
        sizeId: artworksTable.sizeId,
        baseTypeId: artworksTable.baseTypeId,
        paintMaterialId: artworksTable.paintMaterialId,
        theme: artworksTable.theme,
        nationality: artistsTable.country,
      })
      .from(artworksTable)
      .innerJoin(artistsTable, eq(artworksTable.artistId, artistsTable.id))
      .innerJoin(artCategoriesTable, eq(artworksTable.artCategoryId, artCategoriesTable.id))
      .leftJoin(artStylesTable, eq(artworksTable.artStyleId, artStylesTable.id))
      .where(and(...conds))
      .as(`public_artworks_${except ?? "all"}`);
  };
  const forCategories = scoped("artCategoryId");
  const forStyles = scoped("artStyleId");
  const forSizes = scoped("sizeId");
  const forBaseTypes = scoped("baseTypeId");
  const forMaterials = scoped("paintMaterialId");
  const publicArtworks = scoped(null);

  const [categories, styles, sizes, freeText, baseTypes, paintMaterials] = await Promise.all([
    db
      .select({
        id: artCategoriesTable.id,
        name: artCategoriesTable.name,
        count: sql<number>`count(${forCategories.artCategoryId})::int`,
      })
      .from(artCategoriesTable)
      .leftJoin(forCategories, eq(forCategories.artCategoryId, artCategoriesTable.id))
      .groupBy(artCategoriesTable.id, artCategoriesTable.name, artCategoriesTable.displayOrder)
      .orderBy(artCategoriesTable.displayOrder),

    db
      .select({
        id: artStylesTable.id,
        name: artStylesTable.name,
        count: sql<number>`count(${forStyles.artStyleId})::int`,
      })
      .from(artStylesTable)
      .leftJoin(forStyles, eq(forStyles.artStyleId, artStylesTable.id))
      .groupBy(artStylesTable.id, artStylesTable.name, artStylesTable.displayOrder)
      .orderBy(artStylesTable.displayOrder),

    db
      .select({
        id: sizesTable.id,
        name: sizesTable.code,
        count: sql<number>`count(${forSizes.sizeId})::int`,
      })
      .from(sizesTable)
      .leftJoin(forSizes, eq(forSizes.sizeId, sizesTable.id))
      .groupBy(sizesTable.id, sizesTable.code, sizesTable.displayOrder)
      .orderBy(sizesTable.displayOrder),

    db
      .select({ theme: publicArtworks.theme, nationality: publicArtworks.nationality })
      .from(publicArtworks),

    db
      .select({
        id: baseTypesTable.id,
        name: baseTypesTable.name,
        count: sql<number>`count(${forBaseTypes.baseTypeId})::int`,
      })
      .from(baseTypesTable)
      .leftJoin(forBaseTypes, eq(forBaseTypes.baseTypeId, baseTypesTable.id))
      .groupBy(baseTypesTable.id, baseTypesTable.name, baseTypesTable.displayOrder)
      .orderBy(baseTypesTable.displayOrder),

    db
      .select({
        id: paintMaterialsTable.id,
        name: paintMaterialsTable.name,
        count: sql<number>`count(${forMaterials.paintMaterialId})::int`,
      })
      .from(paintMaterialsTable)
      .leftJoin(forMaterials, eq(forMaterials.paintMaterialId, paintMaterialsTable.id))
      .groupBy(paintMaterialsTable.id, paintMaterialsTable.name, paintMaterialsTable.displayOrder)
      .orderBy(paintMaterialsTable.displayOrder),
  ]);

  const themes = [...new Set(freeText.map((r) => r.theme).filter(Boolean))].sort();

  // `artistsTable.country` is free text, not a lookup table, so the same value
  // can arrive as "Pakistan", "pakistan " or "PAKISTAN" on different rows. A
  // plain Set would list each spelling as its own option. Normalise on
  // lowercased+trimmed key, keep the first-seen display casing, so visually
  // identical countries collapse into a single filter entry.
  const nationalityByKey = new Map<string, string>();
  for (const row of freeText) {
    const raw = (row.nationality as string | null)?.trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!nationalityByKey.has(key)) nationalityByKey.set(key, raw);
  }
  const nationalities = [...nationalityByKey.values()].sort();

  res.json(
    GetArtworkFiltersResponse.parse({
      nationalities,
      themes,
      categories,
      styles,
      sizes,
      baseTypes,
      paintMaterials,
      // deprecated: style names as bare strings, for any view not yet migrated
      artTypes: styles.filter((s) => s.count > 0).map((s) => s.name),
    }),
  );
});

router.get("/artworks/:id", async (req, res): Promise<void> => {
  const params = GetArtworkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }

  const rows = await db
    .select({
      ...ARTWORK_CARD,
      techniqueId: artworksTable.techniqueId,
      technique: techniquesTable.name,
      artSubcategoryId: artworksTable.artSubcategoryId,
      artSubcategory: artSubcategoriesTable.name,
      baseTypeId: artworksTable.baseTypeId,
      baseType: baseTypesTable.name,
      paintMaterialId: artworksTable.paintMaterialId,
      paintMaterial: paintMaterialsTable.name,
      depthCm: artworksTable.depthCm,
      weightGrams: artworksTable.weightGrams,

      history: artworksTable.history,
      styleExplanation: artworksTable.styleExplanation,
      culturalContext: artworksTable.culturalContext,
      dimensions: artworksTable.dimensions,
      medium: artworksTable.medium,
      widthCm: artworksTable.widthCm,
      heightCm: artworksTable.heightCm,
      tagline: artworksTable.tagline,
      frameIncluded: artworksTable.frameIncluded,
      frameDescription: artworksTable.frameDescription,
      timeline: artworksTable.timeline,

      artistBio: artistsTable.biography,
      artistCountry: artistsTable.country,
      artistBirthYear: artistsTable.birthYear,
      artistStyle: artistsTable.style,
      artistPhotoUrl: artistsTable.photoUrl,
      artistInfluences: artistsTable.influences,
      artistAwards: artistsTable.awards,
      artistExhibitions: artistsTable.exhibitions,

      // Where the piece is kept (a category like "Company warehouse") is public;
      // the supplier's contact person is personal data and is not.
      storageLocation: storageLocationsTable.name,
    })
    .from(artworksTable)
    .innerJoin(artistsTable, eq(artworksTable.artistId, artistsTable.id))
    .innerJoin(artCategoriesTable, eq(artworksTable.artCategoryId, artCategoriesTable.id))
    .leftJoin(artStylesTable, eq(artworksTable.artStyleId, artStylesTable.id))
    .leftJoin(sizesTable, eq(artworksTable.sizeId, sizesTable.id))
    .leftJoin(techniquesTable, eq(artworksTable.techniqueId, techniquesTable.id))
    .leftJoin(artSubcategoriesTable, eq(artworksTable.artSubcategoryId, artSubcategoriesTable.id))
    .leftJoin(baseTypesTable, eq(artworksTable.baseTypeId, baseTypesTable.id))
    .leftJoin(paintMaterialsTable, eq(artworksTable.paintMaterialId, paintMaterialsTable.id))
    .leftJoin(suppliersTable, eq(suppliersTable.artworkId, artworksTable.id))
    .leftJoin(storageLocationsTable, eq(storageLocationsTable.id, suppliersTable.storageLocationId))
    .where(eq(artworksTable.id, params.data.id));

  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: "Artwork not found" });
    return;
  }

  const tagNames = (
    await db
      .select({ name: tagsTable.name })
      .from(artworkTagsTable)
      .innerJoin(tagsTable, eq(artworkTagsTable.tagId, tagsTable.id))
      .where(eq(artworkTagsTable.artworkId, row.id))
  ).map((t) => t.name);

  const held = await artworkAvailability([row.id]);
  res.json(GetArtworkResponse.parse({ ...withLegacyAlias(row), tags: tagNames, availability: held.get(row.id) ?? "available" }));
});

export default router;
