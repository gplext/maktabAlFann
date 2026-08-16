import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  shopItemsTable,
  artworksTable,
  artCategoriesTable,
  artStylesTable,
} from "@workspace/db";
import { requireAdminSession } from "./admin-auth";
import {
  ListShopItemsQueryParams,
  ListShopItemsResponse,
  GetArtworkAddonsParams,
  GetArtworkAddonsResponse,
  CreateShopItemBody,
  UpdateShopItemParams,
  UpdateShopItemBody,
  UpdateShopItemResponse,
  DeleteShopItemParams,
  DeleteShopItemResponse,
} from "@workspace/api-zod";
import { formatZodError } from "../lib/validation";

const router: IRouter = Router();

router.get("/shop/items", async (req, res): Promise<void> => {
  const parsed = ListShopItemsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const { type } = parsed.data;
  const conditions: Parameters<typeof and>[0][] = [eq(shopItemsTable.status, "active")];
  if (type) conditions.push(eq(shopItemsTable.type, type));

  const items = await db
    .select()
    .from(shopItemsTable)
    .where(and(...(conditions as [Parameters<typeof and>[0], ...Parameters<typeof and>[0][]])));

  res.json(ListShopItemsResponse.parse(items));
});

router.get("/artworks/:id/addons", async (req, res): Promise<void> => {
  const params = GetArtworkAddonsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }

  const artworkRows = await db
    .select({ artStyle: artStylesTable.name, artCategory: artCategoriesTable.name })
    .from(artworksTable)
    .innerJoin(artCategoriesTable, eq(artworksTable.artCategoryId, artCategoriesTable.id))
    .leftJoin(artStylesTable, eq(artworksTable.artStyleId, artStylesTable.id))
    .where(eq(artworksTable.id, params.data.id));

  if (artworkRows.length === 0) {
    res.json([]);
    return;
  }

  const { artStyle, artCategory } = artworkRows[0];

  // Match add-ons compatible with this artwork's type or category
  const matchValues = [artStyle, artCategory].filter(Boolean) as string[];
  if (matchValues.length === 0) {
    res.json([]);
    return;
  }

  const allAddons = await db
    .select()
    .from(shopItemsTable)
    .where(and(eq(shopItemsTable.isAddon, true), eq(shopItemsTable.status, "active")));

  const addons = allAddons.filter((item) =>
    item.compatibleArtCategories.length === 0 ||
    item.compatibleArtCategories.some((c) => matchValues.includes(c))
  );

  res.json(GetArtworkAddonsResponse.parse(addons));
});

router.get("/admin/shop/items", requireAdminSession, async (req, res): Promise<void> => {
  const items = await db.select().from(shopItemsTable);
  res.json(items);
});

router.post("/admin/shop/items", requireAdminSession, async (req, res): Promise<void> => {
  const parsed = CreateShopItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const { name, description, type, imageUrl, isAddon, compatibleArtCategories, stock, status, price } = parsed.data;

  const [item] = await db
    .insert(shopItemsTable)
    .values({
      name,
      description: description ?? "",
      type,
      imageUrl: imageUrl ?? "",
      isAddon: isAddon ?? false,
      compatibleArtCategories: compatibleArtCategories ?? [],
      stock: stock ?? 0,
      status: status ?? "active",
      price: price ?? 0,
    })
    .returning();

  res.status(201).json(UpdateShopItemResponse.parse(item));
});

router.put("/admin/shop/items/:id", requireAdminSession, async (req, res): Promise<void> => {
  const params = UpdateShopItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }
  const body = UpdateShopItemBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: formatZodError(body.error) });
    return;
  }

  const { name, description, type, imageUrl, isAddon, compatibleArtCategories, stock, status, price } = body.data;

  const [updated] = await db
    .update(shopItemsTable)
    .set({
      name,
      description: description ?? "",
      type,
      imageUrl: imageUrl ?? "",
      isAddon: isAddon ?? false,
      compatibleArtCategories: compatibleArtCategories ?? [],
      stock: stock ?? 0,
      status: status ?? "active",
      price: price ?? 0,
    })
    .where(eq(shopItemsTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Shop item not found" });
    return;
  }

  res.json(UpdateShopItemResponse.parse(updated));
});

router.delete("/admin/shop/items/:id", requireAdminSession, async (req, res): Promise<void> => {
  const params = DeleteShopItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }

  await db.delete(shopItemsTable).where(eq(shopItemsTable.id, params.data.id));

  res.json(DeleteShopItemResponse.parse({ success: true }));
});

export default router;
