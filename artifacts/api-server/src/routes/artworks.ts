import { Router, type IRouter } from "express";
import { eq, and, inArray, sql, type SQL } from "drizzle-orm";
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
  } = parsed.data;

  const conditions: SQL[] = [PUBLIC_ONLY!];

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

  const rows = await cardQuery()
    .where(and(...conditions))
    .limit(limit ?? 100)
    .offset(offset ?? 0);

  res.json(ListArtworksResponse.parse(rows.map(withLegacyAlias)));
});

router.get("/artworks/featured", async (_req, res): Promise<void> => {
  const rows = await cardQuery()
    .where(and(PUBLIC_ONLY, eq(artworksTable.isFeatured, true)))
    .limit(6);

  res.json(GetFeaturedArtworksResponse.parse(rows.map(withLegacyAlias)));
});

/**
 * Filter options for the /art sidebar.
 *
 * Categories, styles and sizes come from the lookup tables with a live count,
 * so the sidebar can grey out or hide an empty option instead of offering a
 * filter that returns nothing — which is exactly what used to happen when
 * artworks were tagged 'Handicraft' and the category list said 'Paintings'.
 */
router.get("/artworks/filters", async (_req, res): Promise<void> => {
  const publicArtworks = db
    .select({
      artCategoryId: artworksTable.artCategoryId,
      artStyleId: artworksTable.artStyleId,
      sizeId: artworksTable.sizeId,
      theme: artworksTable.theme,
      nationality: artistsTable.country,
    })
    .from(artworksTable)
    .innerJoin(artistsTable, eq(artworksTable.artistId, artistsTable.id))
    .where(PUBLIC_ONLY)
    .as("public_artworks");

  const [categories, styles, sizes, freeText] = await Promise.all([
    db
      .select({
        id: artCategoriesTable.id,
        name: artCategoriesTable.name,
        count: sql<number>`count(${publicArtworks.artCategoryId})::int`,
      })
      .from(artCategoriesTable)
      .leftJoin(publicArtworks, eq(publicArtworks.artCategoryId, artCategoriesTable.id))
      .groupBy(artCategoriesTable.id, artCategoriesTable.name, artCategoriesTable.displayOrder)
      .orderBy(artCategoriesTable.displayOrder),

    db
      .select({
        id: artStylesTable.id,
        name: artStylesTable.name,
        count: sql<number>`count(${publicArtworks.artStyleId})::int`,
      })
      .from(artStylesTable)
      .leftJoin(publicArtworks, eq(publicArtworks.artStyleId, artStylesTable.id))
      .groupBy(artStylesTable.id, artStylesTable.name, artStylesTable.displayOrder)
      .orderBy(artStylesTable.displayOrder),

    db
      .select({
        id: sizesTable.id,
        name: sizesTable.code,
        count: sql<number>`count(${publicArtworks.sizeId})::int`,
      })
      .from(sizesTable)
      .leftJoin(publicArtworks, eq(publicArtworks.sizeId, sizesTable.id))
      .groupBy(sizesTable.id, sizesTable.code, sizesTable.displayOrder)
      .orderBy(sizesTable.displayOrder),

    db
      .select({ theme: publicArtworks.theme, nationality: publicArtworks.nationality })
      .from(publicArtworks),
  ]);

  const themes = [...new Set(freeText.map((r) => r.theme).filter(Boolean))].sort();

  // `artistsTable.country` is free text, not a lookup table, so the same value
  // can arrive as "Pakistan", "pakistan " or "PAKISTAN" on different rows. A
  // plain Set would list each spelling as its own option. Normalise on
  // lowercased+trimmed key, keep the first-seen display casing, so visually
  // identical countries collapse into a single filter entry.
  const nationalityByKey = new Map<string, string>();
  for (const row of freeText) {
    const raw = row.nationality?.trim();
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

      storageLocation: storageLocationsTable.name,
      supplierName: suppliersTable.contactPerson,
    })
    .from(artworksTable)
    .innerJoin(artistsTable, eq(artworksTable.artistId, artistsTable.id))
    .innerJoin(artCategoriesTable, eq(artworksTable.artCategoryId, artCategoriesTable.id))
    .leftJoin(artStylesTable, eq(artworksTable.artStyleId, artStylesTable.id))
    .leftJoin(sizesTable, eq(artworksTable.sizeId, sizesTable.id))
    .leftJoin(techniquesTable, eq(artworksTable.techniqueId, techniquesTable.id))
    .leftJoin(artSubcategoriesTable, eq(artworksTable.artSubcategoryId, artSubcategoriesTable.id))
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

  res.json(GetArtworkResponse.parse({ ...withLegacyAlias(row), tags: tagNames }));
});

export default router;
