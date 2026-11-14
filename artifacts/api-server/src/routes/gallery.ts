import { Router, type IRouter } from "express";
import { db, galleryAboutTable, artworksTable, artistsTable } from "@workspace/db";
import { GetGalleryAboutResponse, GetGalleryStatsResponse } from "@workspace/api-zod";
import { publicGalleries } from "../lib/galleries";
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

/** Public contact details for the footer and Contact page (from env; empty when not set). */
router.get("/gallery/contact", (_req, res) => {
  res.set("Cache-Control", "public, max-age=3600");
  res.json({
    whatsapp: (process.env.WHATSAPP_NUMBER ?? "").replace(/\D/g, ""),
    email: (process.env.CONTACT_EMAIL ?? "").trim(),
    city: "Lahore, Pakistan",
  });
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

/** Public "Gallery" page: every approved partner gallery that has public artworks. */
router.get("/galleries/artworks", async (_req, res): Promise<void> => {
  res.json(await publicGalleries());
});

/** One gallery's own page: /gallery/<slug>, e.g. /gallery/noor-atelier. */
router.get("/galleries/:slug", async (req, res): Promise<void> => {
  const gallery = (await publicGalleries()).find((g) => g.slug === String(req.params.slug).toLowerCase());
  if (!gallery) return void res.status(404).json({ error: "Gallery not found" });
  res.json(gallery);
});

export default router;
