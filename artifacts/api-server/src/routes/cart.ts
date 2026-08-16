import { Router, type IRouter } from "express";
import { eq, and, inArray, or } from "drizzle-orm";
import {
  db,
  cartItemsTable,
  artworksTable,
  artistsTable,
  suppliersTable,
  storageLocationsTable,
  shopItemsTable,
  artCategoriesTable,
  artStylesTable,
  sizesTable,
} from "@workspace/db";
import {
  GetCartQueryParams,
  AddToCartBody,
  RemoveFromCartParams,
  GetCartResponse,
} from "@workspace/api-zod";
import { formatZodError } from "../lib/validation";

const router: IRouter = Router();

async function buildCart(sessionId: string) {
  const items = await db
    .select({
      artworkId: cartItemsTable.artworkId,
      title: artworksTable.title,
      artistName: artistsTable.name,
      imageUrl: artworksTable.imageUrl,
      size: sizesTable.code,
      sizeLabel: sizesTable.label,
      // The 3D frame viewer derives its aspect ratio from these — `size` is now
      // a bucket code (L, M, ...) and no longer carries measurements.
      dimensions: artworksTable.dimensions,
      widthCm: artworksTable.widthCm,
      heightCm: artworksTable.heightCm,
      notes: cartItemsTable.notes,
      addedAt: cartItemsTable.addedAt,
      displayPrice: artworksTable.displayPrice,
      storageLocationName: storageLocationsTable.name,
    })
    .from(cartItemsTable)
    .innerJoin(artworksTable, eq(cartItemsTable.artworkId, artworksTable.id))
    .innerJoin(artistsTable, eq(artworksTable.artistId, artistsTable.id))
    .leftJoin(sizesTable, eq(artworksTable.sizeId, sizesTable.id))
    .leftJoin(suppliersTable, eq(suppliersTable.artworkId, artworksTable.id))
    .leftJoin(storageLocationsTable, eq(storageLocationsTable.id, suppliersTable.storageLocationId))
    .where(eq(cartItemsTable.sessionId, sessionId));

  return {
    sessionId,
    items: items.map((item) => ({
      ...item,
      addedAt: item.addedAt.toISOString(),
    })),
  };
}

router.get("/cart", async (req, res): Promise<void> => {
  const parsed = GetCartQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const cart = await buildCart(parsed.data.sessionId);
  res.json(GetCartResponse.parse(cart));
});

router.post("/cart/items", async (req, res): Promise<void> => {
  const parsed = AddToCartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const { artworkId, sessionId, notes } = parsed.data;

  const existing = await db
    .select()
    .from(cartItemsTable)
    .where(
      and(
        eq(cartItemsTable.sessionId, sessionId),
        eq(cartItemsTable.artworkId, artworkId)
      )
    );

  if (existing.length === 0) {
    await db.insert(cartItemsTable).values({
      sessionId,
      artworkId,
      notes: notes ?? "",
    });
  }

  const cart = await buildCart(sessionId);
  res.status(201).json(GetCartResponse.parse(cart));
});

router.delete("/cart/:sessionId/items/:artworkId", async (req, res): Promise<void> => {
  const params = RemoveFromCartParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }

  await db
    .delete(cartItemsTable)
    .where(
      and(
        eq(cartItemsTable.sessionId, params.data.sessionId),
        eq(cartItemsTable.artworkId, params.data.artworkId)
      )
    );

  const cart = await buildCart(params.data.sessionId);
  res.json(GetCartResponse.parse(cart));
});

// ── GET /cart/:sessionId/addons ───────────────────────────────────────────────
// Returns per-artwork frame info + available add-ons for every item in this cart session
router.get("/cart/:sessionId/addons", async (req, res): Promise<void> => {
  const { sessionId } = req.params;
  if (!sessionId) { res.status(400).json({ error: "sessionId required" }); return; }

  const cartItems = await db
    .select({ artworkId: cartItemsTable.artworkId })
    .from(cartItemsTable)
    .where(eq(cartItemsTable.sessionId, sessionId));

  if (cartItems.length === 0) { res.json({}); return; }

  const artworkIds = cartItems.map((i) => i.artworkId);

  const artworks = await db
    .select({
      id: artworksTable.id,
      frameIncluded: artworksTable.frameIncluded,
      frameDescription: artworksTable.frameDescription,
      artStyle: artStylesTable.name,
      artCategory: artCategoriesTable.name,
    })
    .from(artworksTable)
    .innerJoin(artCategoriesTable, eq(artworksTable.artCategoryId, artCategoriesTable.id))
    .leftJoin(artStylesTable, eq(artworksTable.artStyleId, artStylesTable.id))
    .where(inArray(artworksTable.id, artworkIds));

  // Include items marked as add-ons OR any Frames-type item (admins may not tick isAddon)
  const allAddons = await db
    .select()
    .from(shopItemsTable)
    .where(and(
      eq(shopItemsTable.status, "active"),
      or(eq(shopItemsTable.isAddon, true), eq(shopItemsTable.type, "Frames"))
    ));

  const result: Record<number, {
    frameIncluded: boolean;
    frameDescription: string | null;
    availableAddons: typeof allAddons;
  }> = {};

  for (const artwork of artworks) {
    const matchValues = [artwork.artStyle, artwork.artCategory].filter(Boolean) as string[];
    const addons = allAddons.filter((item) =>
      // Frames apply to every artwork — don't filter by art category
      item.type === "Frames" ||
      // Other add-ons: include if compatible list is empty (universal) or has a matching category
      item.compatibleArtCategories.length === 0 ||
      item.compatibleArtCategories.some((c) => matchValues.includes(c))
    );
    result[artwork.id] = {
      frameIncluded: artwork.frameIncluded,
      frameDescription: artwork.frameDescription ?? null,
      availableAddons: addons,
    };
  }

  res.json(result);
});

// ── PATCH /cart/:sessionId/items/:artworkId/addons ────────────────────────────
// Persists selected add-ons for a specific cart item (stored as JSON in notes)
router.patch("/cart/:sessionId/items/:artworkId/addons", async (req, res): Promise<void> => {
  const { sessionId, artworkId: artworkIdStr } = req.params;
  const artworkId = Number(artworkIdStr);
  if (!sessionId || isNaN(artworkId)) { res.status(400).json({ error: "Invalid params" }); return; }

  const { selectedAddons } = req.body;
  if (!Array.isArray(selectedAddons)) { res.status(400).json({ error: "selectedAddons must be an array" }); return; }

  await db
    .update(cartItemsTable)
    .set({ notes: JSON.stringify({ selectedAddons }) })
    .where(and(eq(cartItemsTable.sessionId, sessionId), eq(cartItemsTable.artworkId, artworkId)));

  res.json({ ok: true });
});

export default router;
