import { Router, type IRouter } from "express";
import { eq, and, gte, lte, ilike, sql, type SQL } from "drizzle-orm";
import {
  db,
  artistsTable,
  artworksTable,
  artCategoriesTable,
  artStylesTable,
  sizesTable,
} from "@workspace/db";
import {
  ListArtistsQueryParams,
  GetArtistParams,
  ListArtistsResponse,
  GetArtistResponse,
} from "@workspace/api-zod";
import { formatZodError } from "../lib/validation";

/** The artist's best public artwork picture, shown when there is no real portrait. */
const COVER_IMAGE = sql<string | null>`(
  SELECT w.image_url FROM artworks w
  WHERE w.artist_id = ${artistsTable.id} AND w.status = 'approved'
    AND w.image_url <> '' AND w.image_url NOT LIKE '%placehold.co%'
  ORDER BY w.is_featured DESC, w.id DESC LIMIT 1
)`;

/** Artists are only shown publicly once they have at least one approved artwork. */
const HAS_PUBLIC_WORK = sql`EXISTS (SELECT 1 FROM artworks w WHERE w.artist_id = ${artistsTable.id} AND w.status = 'approved')`;

const router: IRouter = Router();

router.get("/artists", async (req, res): Promise<void> => {
  const parsed = ListArtistsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const { country, gender, style, minAge, maxAge, search } = parsed.data;
  const currentYear = new Date().getFullYear();

  const conditions: SQL[] = [eq(artistsTable.isVerified, "approved"), HAS_PUBLIC_WORK];
  if (country) conditions.push(eq(artistsTable.country, country));
  if (gender) conditions.push(eq(artistsTable.gender, gender));
  if (style) conditions.push(eq(artistsTable.style, style));
  if (minAge != null) conditions.push(lte(artistsTable.birthYear, currentYear - minAge));
  if (maxAge != null) conditions.push(gte(artistsTable.birthYear, currentYear - maxAge));
  if (search) conditions.push(ilike(artistsTable.name, `%${search}%`));

  const countSubquery = db
    .select({ artistId: artworksTable.artistId, count: sql<number>`count(*)::int`.as("count") })
    .from(artworksTable)
    .where(eq(artworksTable.status, "approved"))
    .groupBy(artworksTable.artistId)
    .as("artwork_counts");

  const rows = await db
    .select({
      id: artistsTable.id,
      name: artistsTable.name,
      country: artistsTable.country,
      birthYear: artistsTable.birthYear,
      age: sql<number>`(${currentYear} - ${artistsTable.birthYear})`,
      gender: artistsTable.gender,
      style: artistsTable.style,
      photoUrl: artistsTable.photoUrl,
      coverImageUrl: COVER_IMAGE,
      shortBio: artistsTable.shortBio,
      saying: artistsTable.saying,
      sayingAuthor: artistsTable.sayingAuthor,
      artworkCount: sql<number>`coalesce(${countSubquery.count}, 0)`,
    })
    .from(artistsTable)
    .leftJoin(countSubquery, eq(artistsTable.id, countSubquery.artistId))
    .where(and(...conditions));

  res.json(ListArtistsResponse.parse(rows));
});

router.get("/artists/:id", async (req, res): Promise<void> => {
  const params = GetArtistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }

  const currentYear = new Date().getFullYear();
  const countSubquery = db
    .select({ artistId: artworksTable.artistId, count: sql<number>`count(*)::int`.as("count") })
    .from(artworksTable)
    .where(eq(artworksTable.status, "approved"))
    .groupBy(artworksTable.artistId)
    .as("artwork_counts");

  const artistRows = await db
    .select({
      id: artistsTable.id,
      name: artistsTable.name,
      country: artistsTable.country,
      birthYear: artistsTable.birthYear,
      age: sql<number>`(${currentYear} - ${artistsTable.birthYear})`,
      gender: artistsTable.gender,
      style: artistsTable.style,
      photoUrl: artistsTable.photoUrl,
      coverImageUrl: COVER_IMAGE,
      shortBio: artistsTable.shortBio,
      saying: artistsTable.saying,
      sayingAuthor: artistsTable.sayingAuthor,
      biography: artistsTable.biography,
      influences: artistsTable.influences,
      awards: artistsTable.awards,
      exhibitions: artistsTable.exhibitions,
      artworkCount: sql<number>`coalesce(${countSubquery.count}, 0)`,
    })
    .from(artistsTable)
    .leftJoin(countSubquery, eq(artistsTable.id, countSubquery.artistId))
    .where(and(eq(artistsTable.id, params.data.id), eq(artistsTable.isVerified, "approved"), HAS_PUBLIC_WORK));

  if (artistRows.length === 0) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }

  const artist = artistRows[0];

  const artworkRows = await db
    .select({
      id: artworksTable.id,
      title: artworksTable.title,
      artistId: artworksTable.artistId,
      artistName: artistsTable.name,
      artCategory: artCategoriesTable.name,
      artStyle: artStylesTable.name,
      nationality: artistsTable.country,
      theme: artworksTable.theme,
      size: sizesTable.code,
      year: artworksTable.year,
      imageUrl: artworksTable.imageUrl,
      thumbnailUrl: artworksTable.thumbnailUrl,
      shortDescription: artworksTable.shortDescription,
      isFeatured: artworksTable.isFeatured,
    })
    .from(artworksTable)
    .innerJoin(artistsTable, eq(artworksTable.artistId, artistsTable.id))
    .innerJoin(artCategoriesTable, eq(artworksTable.artCategoryId, artCategoriesTable.id))
    .leftJoin(artStylesTable, eq(artworksTable.artStyleId, artStylesTable.id))
    .leftJoin(sizesTable, eq(artworksTable.sizeId, sizesTable.id))
    .where(and(eq(artworksTable.artistId, params.data.id), eq(artworksTable.status, "approved")));

  res.json(
    GetArtistResponse.parse({
      ...artist,
      // artType is a deprecated alias of artStyle — see api-zod.
      artworks: artworkRows.map((a) => ({ ...a, artType: a.artStyle })),
    }),
  );
});

export default router;
