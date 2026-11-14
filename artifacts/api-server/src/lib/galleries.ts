import { and, asc, desc, eq } from "drizzle-orm";
import {
  db, artworksTable, artistsTable, galleriesTable, galleryArtworksTable, artCategoriesTable, artStylesTable,
} from "@workspace/db";

/** "Noor Atelier" → "noor-atelier" (used in /gallery/<slug>). */
export function slugify(name: string): string {
  return name
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 80) || "gallery";
}

export type PublicGalleryArtwork = {
  id: number; title: string; imageUrl: string; year: number; theme: string;
  artistName: string; artCategory: string; artStyle: string | null; displayPrice: number | null;
};
export type PublicGallery = {
  id: number; slug: string; name: string; description: string; city: string; country: string;
  websiteUrl: string; logoUrl: string; artworks: PublicGalleryArtwork[];
};

/**
 * Approved partner galleries with the public artworks they uploaded (newest first).
 * Galleries without public artworks are left out. Each gets a unique slug; if two
 * galleries share a name, the later one gets "-<id>" added.
 */
export async function publicGalleries(): Promise<PublicGallery[]> {
  const rows = await db
    .select({
      galleryId: galleriesTable.id,
      galleryName: galleriesTable.name,
      description: galleriesTable.description,
      city: galleriesTable.city,
      country: galleriesTable.country,
      websiteUrl: galleriesTable.websiteUrl,
      logoUrl: galleriesTable.logoUrl,
      id: artworksTable.id,
      title: artworksTable.title,
      imageUrl: artworksTable.imageUrl,
      thumbnailUrl: artworksTable.thumbnailUrl,
      year: artworksTable.year,
      theme: artworksTable.theme,
      artistName: artistsTable.name,
      artCategory: artCategoriesTable.name,
      artStyle: artStylesTable.name,
      displayPrice: artworksTable.displayPrice,
    })
    .from(galleryArtworksTable)
    .innerJoin(galleriesTable, eq(galleryArtworksTable.galleryId, galleriesTable.id))
    .innerJoin(artworksTable, eq(galleryArtworksTable.artworkId, artworksTable.id))
    .innerJoin(artistsTable, eq(artworksTable.artistId, artistsTable.id))
    .innerJoin(artCategoriesTable, eq(artworksTable.artCategoryId, artCategoriesTable.id))
    .leftJoin(artStylesTable, eq(artworksTable.artStyleId, artStylesTable.id))
    .where(and(
      eq(galleriesTable.status, "approved"),
      eq(artworksTable.status, "approved"),
      eq(artistsTable.isVerified, "approved"),
    ))
    .orderBy(asc(galleriesTable.name), asc(galleriesTable.id), desc(galleryArtworksTable.createdAt), desc(artworksTable.id));

  const galleries = new Map<number, PublicGallery>();
  const usedSlugs = new Set<string>();
  for (const r of rows) {
    if (!galleries.has(r.galleryId)) {
      let slug = slugify(r.galleryName);
      if (usedSlugs.has(slug)) slug = `${slug}-${r.galleryId}`;
      usedSlugs.add(slug);
      galleries.set(r.galleryId, {
        id: r.galleryId, slug, name: r.galleryName, description: r.description, city: r.city,
        country: r.country, websiteUrl: r.websiteUrl, logoUrl: r.logoUrl, artworks: [],
      });
    }
    galleries.get(r.galleryId)!.artworks.push({
      id: r.id, title: r.title, imageUrl: r.thumbnailUrl || r.imageUrl, year: r.year, theme: r.theme,
      artistName: r.artistName, artCategory: r.artCategory, artStyle: r.artStyle,
      displayPrice: r.displayPrice == null ? null : Number(r.displayPrice),
    });
  }
  return [...galleries.values()];
}
