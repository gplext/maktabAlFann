import { Router } from "express";
import { getAuth } from "@clerk/express";
import {
  db,
  artistsTable,
  artworksTable,
  galleriesTable,
  galleryArtistsTable,
  galleryArtworksTable,
  artCategoriesTable,
  artStylesTable,
  sizesTable,
  techniquesTable,
  toMoney,
} from "@workspace/db";
import { SubmitArtworkBody, UpdateArtworkBody } from "@workspace/api-zod";
import { validateClassification, deriveDisplayPrice } from "../lib/classification";
import { eq, and, sql, inArray, or } from "drizzle-orm";
import { formatZodError } from "../lib/validation";

const router = Router();

// ── Auth middleware ───────────────────────────────────────────────────────────
async function requireGalleryAuth(req: any, res: any, next: any) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
}

async function requireGallery(req: any, res: any, next: any) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  const [gallery] = await db
    .select()
    .from(galleriesTable)
    .where(eq(galleriesTable.clerkUserId, userId))
    .limit(1);
  if (!gallery) return res.status(403).json({ error: "Gallery profile not found" });
  if (gallery.status === "pending") return res.status(403).json({ error: "Gallery pending approval", code: "PENDING_APPROVAL" });
  if (gallery.status === "rejected") return res.status(403).json({ error: "Gallery registration was rejected", code: "REJECTED" });
  req.gallery = gallery;
  next();
}

// ── GET /gallery-portal/me ────────────────────────────────────────────────────
router.get("/gallery-portal/me", requireGalleryAuth, async (req: any, res) => {
  const [gallery] = await db
    .select()
    .from(galleriesTable)
    .where(eq(galleriesTable.clerkUserId, req.userId))
    .limit(1);
  if (!gallery) return res.status(404).json({ error: "Not found" });
  return res.json(gallery);
});

// ── POST /gallery-portal/register ────────────────────────────────────────────
router.post("/gallery-portal/register", requireGalleryAuth, async (req: any, res) => {
  // Prevent duplicates
  const [existing] = await db
    .select({ id: galleriesTable.id })
    .from(galleriesTable)
    .where(eq(galleriesTable.clerkUserId, req.userId))
    .limit(1);
  if (existing) return res.status(409).json({ error: "Gallery profile already exists" });

  const { name, description, email, phone, city, country, websiteUrl, logoUrl } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Gallery name is required" });

  const [gallery] = await db
    .insert(galleriesTable)
    .values({
      clerkUserId: req.userId,
      name: name.trim(),
      description: description?.trim() ?? "",
      email: email?.trim() ?? "",
      phone: phone?.trim() ?? "",
      city: city?.trim() ?? "",
      country: country?.trim() ?? "Pakistan",
      websiteUrl: websiteUrl?.trim() ?? "",
      logoUrl: logoUrl?.trim() ?? "",
      status: "pending",
    })
    .returning();
  return res.status(201).json(gallery);
});

// ── PATCH /gallery-portal/profile ────────────────────────────────────────────
router.patch("/gallery-portal/profile", requireGallery, async (req: any, res) => {
  const { name, description, email, phone, city, country, websiteUrl, logoUrl } = req.body;
  if (name !== undefined && !name.trim())
    return res.status(400).json({ error: "Gallery name cannot be empty" });

  const [updated] = await db
    .update(galleriesTable)
    .set({
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description.trim() }),
      ...(email !== undefined && { email: email.trim() }),
      ...(phone !== undefined && { phone: phone.trim() }),
      ...(city !== undefined && { city: city.trim() }),
      ...(country !== undefined && { country: country.trim() }),
      ...(websiteUrl !== undefined && { websiteUrl: websiteUrl.trim() }),
      ...(logoUrl !== undefined && { logoUrl: logoUrl.trim() }),
    })
    .where(eq(galleriesTable.id, req.gallery.id))
    .returning();
  return res.json(updated);
});

// ── GET /gallery-portal/artists ──────────────────────────────────────────────
router.get("/gallery-portal/artists", requireGallery, async (req: any, res) => {
  const links = await db
    .select({ artistId: galleryArtistsTable.artistId })
    .from(galleryArtistsTable)
    .where(eq(galleryArtistsTable.galleryId, req.gallery.id));

  if (links.length === 0) return res.json([]);

  const artistIds = links.map((l) => l.artistId);
  const artists = await db
    .select({
      id: artistsTable.id,
      name: artistsTable.name,
      style: artistsTable.style,
      photoUrl: artistsTable.photoUrl,
      country: artistsTable.country,
      isVerified: artistsTable.isVerified,
    })
    .from(artistsTable)
    .where(inArray(artistsTable.id, artistIds));

  // Artwork counts per artist (only artworks also in this gallery)
  const galleryArtworkLinks = await db
    .select({ artworkId: galleryArtworksTable.artworkId })
    .from(galleryArtworksTable)
    .where(eq(galleryArtworksTable.galleryId, req.gallery.id));

  const galleryArtworkIds = new Set(galleryArtworkLinks.map((l) => l.artworkId));

  const artworkCounts: Record<number, number> = {};
  if (galleryArtworkIds.size > 0) {
    const artworkRows = await db
      .select({ id: artworksTable.id, artistId: artworksTable.artistId })
      .from(artworksTable)
      .where(inArray(artworksTable.id, [...galleryArtworkIds]));
    for (const row of artworkRows) {
      artworkCounts[row.artistId] = (artworkCounts[row.artistId] ?? 0) + 1;
    }
  }

  return res.json(
    artists.map((a) => ({ ...a, artworkCount: artworkCounts[a.id] ?? 0 })),
  );
});

// ── POST /gallery-portal/check-artist ────────────────────────────────────────
// Checks if an artist exists by email OR phone; returns their credentials if so
router.post("/gallery-portal/check-artist", requireGallery, async (req: any, res) => {
  const { email, phone } = req.body;
  if (!email?.trim() && !phone?.trim()) return res.json({ match: false });

  const normalizePhone = (p: string) => p.replace(/[\s\-\(\)\+]/g, "");

  const conditions: any[] = [];
  if (email?.trim()) {
    conditions.push(sql`lower(${artistsTable.contactEmail}) = ${email.trim().toLowerCase()} AND ${artistsTable.contactEmail} != ''`);
  }
  if (phone?.trim()) {
    // store normalized phone for comparison
    const np = normalizePhone(phone.trim());
    conditions.push(sql`replace(replace(replace(replace(${artistsTable.phone},' ',''),'-',''),'(',''),')','') = ${np} AND ${artistsTable.phone} != ''`);
  }

  const [artist] = await db
    .select({
      id: artistsTable.id,
      name: artistsTable.name,
      style: artistsTable.style,
      country: artistsTable.country,
      photoUrl: artistsTable.photoUrl,
      contactEmail: artistsTable.contactEmail,
      phone: artistsTable.phone,
      isVerified: artistsTable.isVerified,
      shortBio: artistsTable.shortBio,
    })
    .from(artistsTable)
    .where(or(...conditions))
    .limit(1);

  if (!artist) return res.json({ match: false });
  return res.json({ match: true, artist });
});

// ── POST /gallery-portal/artists ─────────────────────────────────────────────
// Creates artist if not found by name, then links to gallery
router.post("/gallery-portal/artists", requireGallery, async (req: any, res) => {
  const { name, style, shortBio, photoUrl, country, birthYear } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Artist name is required" });
  if (!style?.trim()) return res.status(400).json({ error: "Artist style is required" });

  const normalised = name.trim().toLowerCase();

  // Check if artist exists (case-insensitive name match)
  const [existing] = await db
    .select({ id: artistsTable.id, name: artistsTable.name })
    .from(artistsTable)
    .where(sql`lower(${artistsTable.name}) = ${normalised}`)
    .limit(1);

  let artist = existing;

  if (!artist) {
    // Create new artist — galleries bypass verification
    const [created] = await db
      .insert(artistsTable)
      .values({
        name: name.trim(),
        style: style.trim(),
        shortBio: (shortBio ?? "").trim(),
        photoUrl: (photoUrl ?? "").trim(),
        country: (country ?? "Pakistan").trim(),
        birthYear: Number(birthYear) || new Date().getFullYear(),
        isVerified: "approved",
        gender: "",
        biography: "",
        influences: "",
      })
      .returning({ id: artistsTable.id, name: artistsTable.name });
    artist = created!;
  }

  // Link to gallery (ignore conflict = already linked)
  await db
    .insert(galleryArtistsTable)
    .values({ galleryId: req.gallery.id, artistId: artist.id })
    .onConflictDoNothing();

  const [full] = await db
    .select({
      id: artistsTable.id,
      name: artistsTable.name,
      style: artistsTable.style,
      photoUrl: artistsTable.photoUrl,
      country: artistsTable.country,
      isVerified: artistsTable.isVerified,
    })
    .from(artistsTable)
    .where(eq(artistsTable.id, artist.id));

  return res.status(existing ? 200 : 201).json({
    ...full,
    artworkCount: 0,
    wasExisting: !!existing,
  });
});

// ── GET /gallery-portal/artists/:id ──────────────────────────────────────────
router.get("/gallery-portal/artists/:id", requireGallery, async (req: any, res) => {
  const artistId = Number(req.params.id);
  if (isNaN(artistId)) return res.status(400).json({ error: "Invalid id" });

  // Confirm this artist is linked to the gallery
  const [link] = await db
    .select({ artistId: galleryArtistsTable.artistId })
    .from(galleryArtistsTable)
    .where(and(eq(galleryArtistsTable.galleryId, req.gallery.id), eq(galleryArtistsTable.artistId, artistId)))
    .limit(1);
  if (!link) return res.status(403).json({ error: "Artist not in your gallery" });

  const [artist] = await db
    .select({
      id: artistsTable.id,
      name: artistsTable.name,
      style: artistsTable.style,
      country: artistsTable.country,
      birthYear: artistsTable.birthYear,
      gender: artistsTable.gender,
      shortBio: artistsTable.shortBio,
      biography: artistsTable.biography,
      influences: artistsTable.influences,
      websiteUrl: artistsTable.websiteUrl,
      contactEmail: artistsTable.contactEmail,
      phone: artistsTable.phone,
      photoUrl: artistsTable.photoUrl,
      isVerified: artistsTable.isVerified,
    })
    .from(artistsTable)
    .where(eq(artistsTable.id, artistId))
    .limit(1);

  if (!artist) return res.status(404).json({ error: "Not found" });
  return res.json(artist);
});

// ── PATCH /gallery-portal/artists/:id ────────────────────────────────────────
router.patch("/gallery-portal/artists/:id", requireGallery, async (req: any, res) => {
  const artistId = Number(req.params.id);
  if (isNaN(artistId)) return res.status(400).json({ error: "Invalid id" });

  // Confirm link
  const [link] = await db
    .select({ artistId: galleryArtistsTable.artistId })
    .from(galleryArtistsTable)
    .where(and(eq(galleryArtistsTable.galleryId, req.gallery.id), eq(galleryArtistsTable.artistId, artistId)))
    .limit(1);
  if (!link) return res.status(403).json({ error: "Artist not in your gallery" });

  const { name, style, country, birthYear, gender, shortBio, biography, influences, websiteUrl, contactEmail, phone, photoUrl } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Artist name is required" });
  if (!style?.trim()) return res.status(400).json({ error: "Art style is required" });

  const [updated] = await db
    .update(artistsTable)
    .set({
      ...(name       !== undefined && { name: name.trim() }),
      ...(style      !== undefined && { style: style.trim() }),
      ...(country    !== undefined && { country: country.trim() }),
      ...(birthYear  !== undefined && { birthYear: Number(birthYear) || undefined }),
      ...(gender     !== undefined && { gender: gender.trim() }),
      ...(shortBio   !== undefined && { shortBio: shortBio.trim() }),
      ...(biography  !== undefined && { biography: biography.trim() }),
      ...(influences !== undefined && { influences: influences.trim() }),
      ...(websiteUrl !== undefined && { websiteUrl: websiteUrl.trim() }),
      ...(contactEmail !== undefined && { contactEmail: contactEmail.trim() }),
      ...(phone      !== undefined && { phone: phone.trim() }),
      ...(photoUrl   !== undefined && { photoUrl: photoUrl.trim() }),
    })
    .where(eq(artistsTable.id, artistId))
    .returning({
      id: artistsTable.id,
      name: artistsTable.name,
      style: artistsTable.style,
      country: artistsTable.country,
      photoUrl: artistsTable.photoUrl,
      isVerified: artistsTable.isVerified,
    });

  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// ── DELETE /gallery-portal/artists/:artistId ─────────────────────────────────
// Removes artist from gallery (not from DB)
router.delete("/gallery-portal/artists/:artistId", requireGallery, async (req: any, res) => {
  const artistId = Number(req.params.artistId);
  if (isNaN(artistId)) return res.status(400).json({ error: "Invalid artistId" });
  await db
    .delete(galleryArtistsTable)
    .where(
      and(
        eq(galleryArtistsTable.galleryId, req.gallery.id),
        eq(galleryArtistsTable.artistId, artistId),
      ),
    );
  return res.json({ ok: true });
});

// ── GET /gallery-portal/artworks ─────────────────────────────────────────────
router.get("/gallery-portal/artworks", requireGallery, async (req: any, res) => {
  const links = await db
    .select({ artworkId: galleryArtworksTable.artworkId })
    .from(galleryArtworksTable)
    .where(eq(galleryArtworksTable.galleryId, req.gallery.id));

  if (links.length === 0) return res.json([]);

  const artworkIds = links.map((l) => l.artworkId);
  const artworks = await db
    .select({
      id: artworksTable.id,
      title: artworksTable.title,
      imageUrl: artworksTable.imageUrl,
      artCategoryId: artworksTable.artCategoryId,
      artCategory: artCategoriesTable.name,
      artStyleId: artworksTable.artStyleId,
      artStyle: artStylesTable.name,
      sizeId: artworksTable.sizeId,
      size: sizesTable.code,
      techniqueId: artworksTable.techniqueId,
      technique: techniquesTable.name,
      year: artworksTable.year,
      shortDescription: artworksTable.shortDescription,
      status: artworksTable.status,
      artistId: artworksTable.artistId,
      medium: artworksTable.medium,
      theme: artworksTable.theme,
      expectedPrice: artworksTable.expectedPrice,
      displayPrice: artworksTable.displayPrice,
    })
    .from(artworksTable)
    .innerJoin(artCategoriesTable, eq(artworksTable.artCategoryId, artCategoriesTable.id))
    .leftJoin(artStylesTable, eq(artworksTable.artStyleId, artStylesTable.id))
    .leftJoin(sizesTable, eq(artworksTable.sizeId, sizesTable.id))
    .leftJoin(techniquesTable, eq(artworksTable.techniqueId, techniquesTable.id))
    .where(inArray(artworksTable.id, artworkIds));

  // Attach artist names
  const artistIds = [...new Set(artworks.map((a) => a.artistId))];
  const artists =
    artistIds.length > 0
      ? await db
          .select({ id: artistsTable.id, name: artistsTable.name })
          .from(artistsTable)
          .where(inArray(artistsTable.id, artistIds))
      : [];
  const artistMap = Object.fromEntries(artists.map((a) => [a.id, a.name]));

  return res.json(artworks.map((aw) => ({ ...aw, artistName: artistMap[aw.artistId] ?? "Unknown" })));
});

// ── POST /gallery-portal/artworks ────────────────────────────────────────────
// Creates artwork if not found (title+artistId), then links to gallery
router.post("/gallery-portal/artworks", requireGallery, async (req: any, res) => {
  const parsedBody = SubmitArtworkBody.safeParse(req.body);
  if (!parsedBody.success) return res.status(400).json({ error: formatZodError(parsedBody.error) });
  const art = parsedBody.data;
  const { title, shortDescription, expectedPrice } = art;

  const aid = Number(req.body.artistId);
  if (!aid || isNaN(aid)) return res.status(400).json({ error: "Artist is required" });

  const invalid = await validateClassification(art);
  if (invalid) return res.status(400).json({ error: invalid });

  // Verify artist is linked to this gallery
  const [link] = await db
    .select({ id: galleryArtistsTable.id })
    .from(galleryArtistsTable)
    .where(
      and(
        eq(galleryArtistsTable.galleryId, req.gallery.id),
        eq(galleryArtistsTable.artistId, aid),
      ),
    )
    .limit(1);
  if (!link) return res.status(400).json({ error: "Artist is not in your gallery" });

  const normTitle = title.trim().toLowerCase();

  // Check if artwork already exists
  const [existing] = await db
    .select({ id: artworksTable.id })
    .from(artworksTable)
    .where(
      and(
        sql`lower(${artworksTable.title}) = ${normTitle}`,
        eq(artworksTable.artistId, aid),
      ),
    )
    .limit(1);

  // The gallery states what the artist expects; the public price is derived
  // from the artist's commission rate, never supplied by the client.
  const [artistForPricing] = await db
    .select({
      name: artistsTable.name,
      defaultCommissionRate: artistsTable.defaultCommissionRate,
    })
    .from(artistsTable)
    .where(eq(artistsTable.id, aid))
    .limit(1);
  const expPrice = expectedPrice != null ? toMoney(expectedPrice) : null;

  let artworkId: number;
  let wasExisting = false;

  if (existing) {
    artworkId = existing.id;
    wasExisting = true;
  } else {
    const [created] = await db
      .insert(artworksTable)
      .values({
        title: title.trim(),
        artistId: aid,
        artCategoryId: art.artCategoryId,
        artStyleId: art.artStyleId ?? null,
        sizeId: art.sizeId ?? null,
        techniqueId: art.techniqueId ?? null,
        artSubcategoryId: art.artSubcategoryId ?? null,
        year: art.year ?? new Date().getFullYear(),
        shortDescription: shortDescription.trim(),
        imageUrl: (art.imageUrl ?? "").trim(),
        thumbnailUrl: (art.imageUrl ?? "").trim(),
        medium: (art.medium ?? "").trim(),
        theme: (art.theme ?? "").trim(),
        dimensions: (art.dimensions ?? "").trim(),
        tagline: art.tagline?.trim() ?? null,
        widthCm: art.widthCm ?? null,
        heightCm: art.heightCm ?? null,
        expectedPrice: expPrice,
        // Galleries used to create artworks with an expected price but no
        // display price, which made them un-orderable ("price on request").
        // Derive it the same way the artist portal does.
        displayPrice: deriveDisplayPrice(expPrice, artistForPricing?.defaultCommissionRate),
        status: "approved",
      })
      .returning({ id: artworksTable.id });
    artworkId = created!.id;
  }

  // Link artwork to gallery
  await db
    .insert(galleryArtworksTable)
    .values({ galleryId: req.gallery.id, artworkId })
    .onConflictDoNothing();

  const [artwork] = await db
    .select({
      id: artworksTable.id,
      title: artworksTable.title,
      imageUrl: artworksTable.imageUrl,
      artCategoryId: artworksTable.artCategoryId,
      artStyleId: artworksTable.artStyleId,
      year: artworksTable.year,
      shortDescription: artworksTable.shortDescription,
      status: artworksTable.status,
      artistId: artworksTable.artistId,
    })
    .from(artworksTable)
    .where(eq(artworksTable.id, artworkId));

  return res.status(wasExisting ? 200 : 201).json({
    ...artwork,
    artistName: artistForPricing?.name ?? "Unknown",
    wasExisting,
  });
});

// ── PATCH /gallery-portal/artworks/:id ───────────────────────────────────────
router.patch("/gallery-portal/artworks/:id", requireGallery, async (req: any, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  // Confirm artwork belongs to this gallery
  const [link] = await db
    .select({ id: galleryArtworksTable.id })
    .from(galleryArtworksTable)
    .where(
      and(
        eq(galleryArtworksTable.galleryId, req.gallery.id),
        eq(galleryArtworksTable.artworkId, id),
      ),
    )
    .limit(1);
  if (!link) return res.status(403).json({ error: "Not in your gallery" });

  const parsedBody = UpdateArtworkBody.safeParse(req.body);
  if (!parsedBody.success) return res.status(400).json({ error: formatZodError(parsedBody.error) });
  const body = parsedBody.data;

  const invalid = await validateClassification(body);
  if (invalid) return res.status(400).json({ error: invalid });

  const updates: Record<string, unknown> = {};
  const copy = [
    "theme", "medium", "dimensions", "widthCm", "heightCm", "year",
    "artCategoryId", "artStyleId", "sizeId", "techniqueId", "artSubcategoryId",
    "frameIncluded", "frameDescription",
  ] as const;
  for (const key of copy) if (body[key] !== undefined) updates[key] = body[key];
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.shortDescription !== undefined) updates.shortDescription = body.shortDescription.trim();
  if (body.tagline !== undefined) updates.tagline = body.tagline?.trim() ?? null;
  if (body.imageUrl !== undefined) {
    updates.imageUrl = body.imageUrl.trim();
    updates.thumbnailUrl = body.imageUrl.trim();
  }

  if (body.expectedPrice !== undefined) {
    const expPrice = body.expectedPrice != null ? toMoney(body.expectedPrice) : null;
    updates.expectedPrice = expPrice;
    const [owner] = await db
      .select({ rate: artistsTable.defaultCommissionRate })
      .from(artworksTable)
      .innerJoin(artistsTable, eq(artworksTable.artistId, artistsTable.id))
      .where(eq(artworksTable.id, id))
      .limit(1);
    updates.displayPrice = deriveDisplayPrice(expPrice, owner?.rate);
  }

  const [updated] = await db
    .update(artworksTable)
    .set(updates)
    .where(eq(artworksTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// ── DELETE /gallery-portal/artworks/:id ──────────────────────────────────────
// Removes artwork from gallery only (not from DB)
router.delete("/gallery-portal/artworks/:id", requireGallery, async (req: any, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db
    .delete(galleryArtworksTable)
    .where(
      and(
        eq(galleryArtworksTable.galleryId, req.gallery.id),
        eq(galleryArtworksTable.artworkId, id),
      ),
    );
  return res.json({ ok: true });
});

export default router;
