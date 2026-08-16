import { Router } from "express";
import { eq, and, or } from "drizzle-orm";
import {
  db,
  suppliersTable,
  artworksTable,
  artistsTable,
  storageLocationsTable,
} from "@workspace/db";
import { requireArtistAuth } from "./artist-portal";

const router = Router();

/**
 * Confirm the signed-in artist actually owns this artwork.
 *
 * `requireArtistAuth` only proves that *somebody* is signed in. Without this
 * check, any collector could walk /artist-portal/artworks/1/supplier upwards
 * and read every supplier's name, both phone numbers, email, street address and
 * Google Maps link — then overwrite them with POST.
 *
 * Ownership is either of:
 *   - the artwork was submitted by this Clerk user (`submitted_by_clerk_id`), or
 *   - the artwork belongs to the artist record this Clerk user is linked to.
 *
 * The second case matters for work an admin or gallery entered on an artist's
 * behalf, where `submitted_by_clerk_id` is null but the artist still owns it.
 */
async function findOwnedArtwork(userId: string, artworkId: number) {
  if (!Number.isInteger(artworkId) || artworkId <= 0) return null;

  const [row] = await db
    .select({ id: artworksTable.id })
    .from(artworksTable)
    .leftJoin(artistsTable, eq(artworksTable.artistId, artistsTable.id))
    .where(
      and(
        eq(artworksTable.id, artworkId),
        or(
          eq(artworksTable.submittedByClerkId, userId),
          eq(artistsTable.clerkUserId, userId),
        ),
      ),
    )
    .limit(1);

  return row ?? null;
}

router.get("/artist-portal/artworks/:id/supplier", requireArtistAuth, async (req, res) => {
  const { userId } = req as unknown as { userId: string };
  const artworkId = Number(req.params.id);

  // 404 rather than 403 — an artwork this artist does not own should not be
  // distinguishable from one that does not exist.
  const owned = await findOwnedArtwork(userId, artworkId);
  if (!owned) return res.status(404).json({ error: "Not found" });

  const [supplier] = await db
    .select()
    .from(suppliersTable)
    .where(eq(suppliersTable.artworkId, artworkId))
    .limit(1);

  return res.json(supplier ?? null);
});

router.post("/artist-portal/artworks/:id/supplier", requireArtistAuth, async (req, res) => {
  const { userId } = req as unknown as { userId: string };
  const artworkId = Number(req.params.id);

  const owned = await findOwnedArtwork(userId, artworkId);
  if (!owned) return res.status(404).json({ error: "Not found" });

  const { storageLocationId, contactPerson, phone1, phone2, email, address, city, googleMap } = req.body;

  const locationId = Number(storageLocationId);
  if (!locationId || Number.isNaN(locationId)) {
    return res.status(400).json({ error: "storageLocationId is required" });
  }

  // A bad id would otherwise fail as a foreign-key violation, i.e. a 500.
  const [location] = await db
    .select({ id: storageLocationsTable.id })
    .from(storageLocationsTable)
    .where(eq(storageLocationsTable.id, locationId))
    .limit(1);
  if (!location) return res.status(400).json({ error: "storageLocationId does not exist" });

  const values = {
    storageLocationId: locationId,
    contactPerson: contactPerson ?? "",
    phone1: phone1 ?? "",
    phone2: phone2 ?? null,
    email: email ?? null,
    address: address ?? "",
    city: city ?? "",
    googleMap: googleMap ?? null,
  };

  const [existing] = await db
    .select({ id: suppliersTable.id })
    .from(suppliersTable)
    .where(eq(suppliersTable.artworkId, artworkId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(suppliersTable)
      .set(values)
      .where(eq(suppliersTable.artworkId, artworkId))
      .returning();
    return res.json(updated);
  }

  const [created] = await db
    .insert(suppliersTable)
    .values({ artworkId, ...values })
    .returning();

  return res.status(201).json(created);
});

export default router;
