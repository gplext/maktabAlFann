import { Router, type IRouter } from "express";
import { db, galleryAboutTable, artworksTable, artistsTable } from "@workspace/db";
import { GetGalleryAboutResponse, GetGalleryStatsResponse } from "@workspace/api-zod";
import { sql, countDistinct } from "drizzle-orm";

const router: IRouter = Router();

router.get("/gallery/about", async (_req, res): Promise<void> => {
  const rows = await db.select().from(galleryAboutTable).limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Gallery info not found" });
    return;
  }

  res.json(GetGalleryAboutResponse.parse(rows[0]));
});

router.get("/gallery/stats", async (_req, res): Promise<void> => {
  const [artworkStats] = await db
    .select({
      totalArtworks: sql<number>`count(*)::int`,
      artTypes: sql<number>`count(distinct ${artworksTable.artStyleId})::int`,
      featuredCount: sql<number>`sum(case when ${artworksTable.isFeatured} then 1 else 0 end)::int`,
    })
    .from(artworksTable);

  const [artistStats] = await db
    .select({
      totalArtists: sql<number>`count(*)::int`,
      countriesRepresented: countDistinct(artistsTable.country),
    })
    .from(artistsTable);

  res.json(
    GetGalleryStatsResponse.parse({
      totalArtworks: artworkStats?.totalArtworks ?? 0,
      totalArtists: artistStats?.totalArtists ?? 0,
      countriesRepresented: artistStats?.countriesRepresented ?? 0,
      artTypes: artworkStats?.artTypes ?? 0,
      featuredCount: artworkStats?.featuredCount ?? 0,
    })
  );
});

export default router;
