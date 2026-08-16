import { Router } from "express";
import { db, portfolioTable, artistsTable } from "@workspace/db";
import type { AdminPortfolioItem } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdminSession } from "./admin-auth";

const router = Router();

router.get("/artists/:id/portfolio", async (req, res) => {
  const artistId = Number(req.params.id);
  if (isNaN(artistId)) return res.status(400).json({ error: "Invalid artist id" });

  const [artist] = await db
    .select({ portfolioDisabled: artistsTable.portfolioDisabled })
    .from(artistsTable)
    .where(eq(artistsTable.id, artistId));

  if (!artist || artist.portfolioDisabled) {
    return res.json({ description: "", imageUrls: [], adminItems: [] });
  }

  const [row] = await db
    .select()
    .from(portfolioTable)
    .where(eq(portfolioTable.artistId, artistId));

  return res.json({
    description: row?.description ?? "",
    imageUrls: row?.imageUrls ?? [],
    adminItems: row?.adminItems ?? [],
  });
});

router.post("/admin/artists/:id/portfolio", requireAdminSession, async (req, res) => {
  const artistId = Number(req.params.id);
  if (isNaN(artistId)) return res.status(400).json({ error: "Invalid artist id" });

  const [artist] = await db
    .select({ id: artistsTable.id })
    .from(artistsTable)
    .where(eq(artistsTable.id, artistId));

  if (!artist) return res.status(404).json({ error: "Artist not found" });

  const {
    description = "",
    imageUrls = [],
    adminItems = [],
  } = req.body as {
    description?: string;
    imageUrls?: string[];
    adminItems?: AdminPortfolioItem[];
  };

  const [existing] = await db
    .select({ id: portfolioTable.id })
    .from(portfolioTable)
    .where(eq(portfolioTable.artistId, artistId));

  if (existing) {
    const [updated] = await db
      .update(portfolioTable)
      .set({ description, imageUrls, adminItems })
      .where(eq(portfolioTable.artistId, artistId))
      .returning();
    return res.json({
      description: updated!.description,
      imageUrls: updated!.imageUrls ?? [],
      adminItems: updated!.adminItems ?? [],
    });
  }

  const [inserted] = await db
    .insert(portfolioTable)
    .values({ artistId, description, imageUrls, adminItems })
    .returning();
  return res.json({
    description: inserted!.description,
    imageUrls: inserted!.imageUrls ?? [],
    adminItems: inserted!.adminItems ?? [],
  });
});

export default router;
export { router as portfolioRouter };
