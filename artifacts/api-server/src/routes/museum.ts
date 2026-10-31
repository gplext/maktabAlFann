import { Router, type IRouter } from "express";
import {
  db, museumsTable, buyerMuseumLayoutsTable, ordersTable, orderLineItemsTable, artworksTable, artistsTable,
} from "@workspace/db";
import { and, eq, inArray, isNotNull, notInArray, or } from "drizzle-orm";
import { requireUser } from "../lib/auth";
import { logger } from "../lib/logger";

/** Buyer portal: "My Museum" — purchased artworks hung in a virtual museum. */
const router: IRouter = Router();

const SEED_MUSEUMS = [
  { code: "white_cube", name: "The White Cube", description: "Bright, quiet, modern — nothing between you and the work.",
    preset: { width: 16, depth: 12, height: 5, wall: "#f4f2ee", floor: "#c9b497", ceiling: "#fbfaf7", light: "bright", columns: false } },
  { code: "shalimar_hall", name: "Shalimar Hall", description: "Warm sandstone and terracotta, inspired by Mughal courts.",
    preset: { width: 20, depth: 14, height: 7, wall: "#e8d9c0", floor: "#9c5a3c", ceiling: "#d9c4a3", light: "warm", columns: true } },
  { code: "concrete_loft", name: "Concrete Loft", description: "Raw concrete and dark timber, an industrial gallery.",
    preset: { width: 18, depth: 12, height: 5, wall: "#b8b5b0", floor: "#3b3936", ceiling: "#9d9a95", light: "neutral", columns: false } },
  { code: "candle_hall", name: "Candle-lit Gallery", description: "A dark hall where each painting glows under its own light.",
    preset: { width: 14, depth: 10, height: 5, wall: "#2a2930", floor: "#1b1917", ceiling: "#151418", light: "night", columns: false } },
];

async function seedMuseums() {
  try {
    await db.insert(museumsTable).values(SEED_MUSEUMS.map((m, i) => ({ ...m, displayOrder: i }))).onConflictDoNothing();
  } catch (err) {
    logger.error({ err }, "Museums not seeded");
  }
}
void seedMuseums();

/** Artworks the user owns: orders that are paid, delivered or completed (never cancelled/refunded). */
async function ownedArtworks(userId: string) {
  return db
    .selectDistinctOn([artworksTable.id], {
      id: artworksTable.id,
      title: artworksTable.title,
      imageUrl: artworksTable.imageUrl,
      year: artworksTable.year,
      medium: artworksTable.medium,
      dimensions: artworksTable.dimensions,
      widthCm: artworksTable.widthCm,
      heightCm: artworksTable.heightCm,
      artistName: artistsTable.name,
      orderId: ordersTable.id,
    })
    .from(orderLineItemsTable)
    .innerJoin(ordersTable, eq(orderLineItemsTable.orderId, ordersTable.id))
    .innerJoin(artworksTable, eq(orderLineItemsTable.artworkId, artworksTable.id))
    .innerJoin(artistsTable, eq(artworksTable.artistId, artistsTable.id))
    .where(and(
      eq(ordersTable.clerkUserId, userId),
      isNotNull(orderLineItemsTable.artworkId),
      notInArray(ordersTable.status, ["cancelled", "refunded"]),
      or(eq(ordersTable.paymentStatus, "paid"), inArray(ordersTable.status, ["paid", "delivered", "completed"])),
    ))
    .orderBy(artworksTable.id);
}

router.get("/museum/museums", async (_req, res) => {
  res.json(await db.select().from(museumsTable).where(eq(museumsTable.active, true)).orderBy(museumsTable.displayOrder));
});

router.get("/museum/me", requireUser, async (req, res) => {
  const userId = (req as any).userId as string;
  const [artworks, [layout]] = await Promise.all([
    ownedArtworks(userId),
    db.select().from(buyerMuseumLayoutsTable).where(eq(buyerMuseumLayoutsTable.accountId, userId)).limit(1),
  ]);
  res.json({ artworks, layout: layout ?? null });
});

router.put("/museum/me", requireUser, async (req, res) => {
  const userId = (req as any).userId as string;
  if (!userId.startsWith("u_")) return res.status(400).json({ error: "Please sign in again to save your museum." });
  const { museumCode, wallColor, slots } = req.body ?? {};
  const [museum] = await db.select().from(museumsTable).where(eq(museumsTable.code, String(museumCode))).limit(1);
  if (!museum) return res.status(400).json({ error: "Unknown museum." });
  if (wallColor != null && !/^#[0-9a-fA-F]{6}$/.test(String(wallColor))) return res.status(400).json({ error: "Invalid wall colour." });

  // Only artworks the buyer actually owns may be hung.
  const owned = new Set((await ownedArtworks(userId)).map((a) => a.id));
  const clean: Record<string, number> = {};
  if (slots && typeof slots === "object") {
    for (const [slot, id] of Object.entries(slots as Record<string, unknown>).slice(0, 80)) {
      if (/^[NESW]\d{1,2}$/.test(slot) && owned.has(Number(id))) clean[slot] = Number(id);
    }
  }
  const values = { accountId: userId, museumCode: museum.code, wallColor: wallColor ?? null, slots: clean, updatedAt: new Date() };
  await db.insert(buyerMuseumLayoutsTable).values(values)
    .onConflictDoUpdate({ target: buyerMuseumLayoutsTable.accountId, set: values });
  res.json({ ok: true, layout: values });
});

export default router;
