import { Router } from "express";
import { db, galleryCommissionTable, toMoney, BASE_CURRENCY } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAdminSession } from "./admin-auth";

const router = Router();

router.get(
  "/admin/gallery-commission",
  requireAdminSession,
  async (_req, res) => {
    const rows = await db
      .select()
      .from(galleryCommissionTable)
      .orderBy(desc(galleryCommissionTable.createdAt));
    return res.json(rows);
  },
);

router.get(
  "/admin/gallery-commission/artist/:artistId",
  requireAdminSession,
  async (req, res) => {
    const artistId = Number(req.params.artistId);
    const rows = await db
      .select()
      .from(galleryCommissionTable)
      .where(eq(galleryCommissionTable.artistId, artistId))
      .orderBy(desc(galleryCommissionTable.createdAt));
    return res.json(rows);
  },
);

router.post(
  "/admin/gallery-commission",
  requireAdminSession,
  async (req, res) => {
    const {
      artworkId,
      artistId,
      artworkTitle = "",
      artistName = "",
      salePrice,
      commissionRate = 30,
      // The database column used to default to 'AED' while this route passed
      // 'PKR'. PKR is the gallery base currency; migration-03 aligned both.
      currency = BASE_CURRENCY,
      notes = "",
    } = req.body;

    if (!artworkId || !artistId || salePrice == null) {
      return res
        .status(400)
        .json({ error: "artworkId, artistId, salePrice are required" });
    }

    const sp = toMoney(Number(salePrice));
    const rate = Number(commissionRate);
    if (!Number.isFinite(sp) || sp < 0) {
      return res.status(400).json({ error: "salePrice must be a non-negative number" });
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({ error: "commissionRate must be between 0 and 100" });
    }

    // The split must add up exactly — gallery_commission_split_check enforces it.
    const commissionAmount = toMoney((sp * rate) / 100);
    const artistEarning = toMoney(sp - commissionAmount);

    const [row] = await db
      .insert(galleryCommissionTable)
      .values({
        artworkId: Number(artworkId),
        artistId: Number(artistId),
        artworkTitle,
        artistName,
        salePrice: sp,
        commissionRate: rate,
        commissionAmount,
        artistEarning,
        currency: String(currency).toUpperCase().slice(0, 3),
        notes,
        status: "pending",
      })
      .returning();

    return res.status(201).json(row);
  },
);

router.patch(
  "/admin/gallery-commission/:id",
  requireAdminSession,
  async (req, res) => {
    const id = Number(req.params.id);
    const { status, notes } = req.body;
    const updates: Partial<typeof galleryCommissionTable.$inferInsert> = {};
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    const [updated] = await db
      .update(galleryCommissionTable)
      .set(updates)
      .where(eq(galleryCommissionTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  },
);

export default router;
