import { Router } from "express";
import type { RequestHandler } from "express";
import { db, artworksTable, artistsTable, galleriesTable, artCategoriesTable, artStylesTable } from "@workspace/db";
import { SetArtworkPriceBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    isAdmin?: boolean;
  }
}

const router = Router();

export const requireAdminSession: RequestHandler = (req, res, next) => {
  if (req.session?.isAdmin === true) return next();
  res.status(401).json({ error: "Unauthorized" });
};

router.post("/admin/login", (req, res) => {
  const { username, password } = req.body;
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    return res.status(503).json({ error: "Admin credentials not configured" });
  }

  if (username === adminUsername && password === adminPassword) {
    req.session.isAdmin = true;
    req.session.save((err) => {
      if (err) { res.status(500).json({ error: "Session error" }); return; }
      res.json({ ok: true });
    });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
  return;
});

router.post("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/admin/me", (req, res) => {
  res.json({ isAdmin: req.session?.isAdmin === true });
});

const ARTWORK_SELECT = {
  id: artworksTable.id,
  title: artworksTable.title,
  imageUrl: artworksTable.imageUrl,
  artCategory: artCategoriesTable.name,
  artStyle: artStylesTable.name,
  year: artworksTable.year,
  shortDescription: artworksTable.shortDescription,
  status: artworksTable.status,
  artistId: artworksTable.artistId,
  expectedPrice: artworksTable.expectedPrice,
  displayPrice: artworksTable.displayPrice,
};

/** Admin listings need the same lookup joins as the public ones. */
async function selectArtworksByStatus(status: string) {
  const rows = await db
    .select(ARTWORK_SELECT)
    .from(artworksTable)
    .innerJoin(artCategoriesTable, eq(artworksTable.artCategoryId, artCategoriesTable.id))
    .leftJoin(artStylesTable, eq(artworksTable.artStyleId, artStylesTable.id))
    .where(eq(artworksTable.status, status));

  // `artType` is a deprecated alias of `artStyle`, kept so the admin console
  // keeps rendering while it is migrated. See api-zod.
  return rows.map((r) => ({ ...r, artType: r.artStyle }));
}

router.get("/admin/artworks/pending", requireAdminSession, async (_req, res) => {
  const rows = await selectArtworksByStatus("pending");
  const artistIds = [...new Set(rows.map((r) => r.artistId))];
  const artists = artistIds.length > 0 ? await db.select({ id: artistsTable.id, name: artistsTable.name }).from(artistsTable) : [];
  const artistMap = Object.fromEntries(artists.map((a) => [a.id, a.name]));
  return res.json(rows.map((r) => ({ ...r, artistName: artistMap[r.artistId] ?? "Unknown" })));
});

router.get("/admin/artworks/approved", requireAdminSession, async (_req, res) => {
  const rows = await selectArtworksByStatus("approved");
  const allArtists = await db.select({ id: artistsTable.id, name: artistsTable.name }).from(artistsTable);
  const artistMap = Object.fromEntries(allArtists.map((a) => [a.id, a.name]));
  return res.json(rows.map((r) => ({ ...r, artistName: artistMap[r.artistId] ?? "Unknown" })));
});

router.get("/admin/artworks/rejected", requireAdminSession, async (_req, res) => {
  const rows = await selectArtworksByStatus("rejected");
  const allArtists = await db.select({ id: artistsTable.id, name: artistsTable.name }).from(artistsTable);
  const artistMap = Object.fromEntries(allArtists.map((a) => [a.id, a.name]));
  return res.json(rows.map((r) => ({ ...r, artistName: artistMap[r.artistId] ?? "Unknown" })));
});

router.patch("/admin/artworks/:id/approve", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  const [updated] = await db
    .update(artworksTable)
    .set({ status: "approved" })
    .where(eq(artworksTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

router.patch("/admin/artworks/:id/reject", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  const [updated] = await db
    .update(artworksTable)
    .set({ status: "rejected" })
    .where(eq(artworksTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

router.patch("/admin/artworks/:id/price", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = SetArtworkPriceBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "displayPrice must be a non-negative number or null" });
  const { displayPrice } = parsed.data;
  const [updated] = await db
    .update(artworksTable)
    .set({ displayPrice })
    .where(eq(artworksTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

router.get("/admin/artists/pending", requireAdminSession, async (_req, res) => {
  const rows = await db
    .select({
      id: artistsTable.id,
      name: artistsTable.name,
      style: artistsTable.style,
      country: artistsTable.country,
      photoUrl: artistsTable.photoUrl,
      isVerified: artistsTable.isVerified,
    })
    .from(artistsTable)
    .where(eq(artistsTable.isVerified, "pending"));
  return res.json(rows);
});

router.patch("/admin/artists/:id/approve", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  const [updated] = await db
    .update(artistsTable)
    .set({ isVerified: "approved" })
    .where(eq(artistsTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

router.patch("/admin/artists/:id/reject", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  const [updated] = await db
    .update(artistsTable)
    .set({ isVerified: "rejected" })
    .where(eq(artistsTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// ── Gallery approval endpoints ─────────────────────────────────────────────
router.get("/admin/galleries", requireAdminSession, async (_req, res) => {
  const rows = await db
    .select({
      id: galleriesTable.id,
      name: galleriesTable.name,
      email: galleriesTable.email,
      phone: galleriesTable.phone,
      city: galleriesTable.city,
      country: galleriesTable.country,
      websiteUrl: galleriesTable.websiteUrl,
      logoUrl: galleriesTable.logoUrl,
      status: galleriesTable.status,
      createdAt: galleriesTable.createdAt,
    })
    .from(galleriesTable)
    .orderBy(galleriesTable.createdAt);
  return res.json(rows);
});

router.patch("/admin/galleries/:id/approve", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [updated] = await db
    .update(galleriesTable)
    .set({ status: "approved" })
    .where(eq(galleriesTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

router.patch("/admin/galleries/:id/reject", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [updated] = await db
    .update(galleriesTable)
    .set({ status: "rejected" })
    .where(eq(galleriesTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

export default router;
export { router as adminAuthRouter };
