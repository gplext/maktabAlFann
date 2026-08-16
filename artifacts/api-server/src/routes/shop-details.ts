import { Router } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  shopItemTypesTable,
  artSubcategoriesTable,
  artCategoriesTable,
  subcategoryCompatibilityTable,
} from "@workspace/db";
import { requireAdminSession } from "./admin-auth";

const router = Router();

// ── Shop Item Types ──────────────────────────────────────────────────────────

router.get("/admin/shop-item-types", requireAdminSession, async (_req, res) => {
  const rows = await db.select().from(shopItemTypesTable).orderBy(shopItemTypesTable.displayOrder);
  return res.json(rows);
});

router.post("/admin/shop-item-types", requireAdminSession, async (req, res) => {
  const { name, basePrice, fixedSizeSupport, sizeSupportedFrom, sizeSupportedTo } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const count = await db.select().from(shopItemTypesTable);
  const [row] = await db.insert(shopItemTypesTable).values({
    name,
    basePrice: basePrice ?? 0,
    fixedSizeSupport: fixedSizeSupport ?? false,
    sizeSupportedFrom: sizeSupportedFrom || null,
    sizeSupportedTo: sizeSupportedTo || null,
    displayOrder: count.length,
  }).returning();
  return res.status(201).json(row);
});

router.patch("/admin/shop-item-types/:id", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  const { name, basePrice, fixedSizeSupport, sizeSupportedFrom, sizeSupportedTo } = req.body;
  const [row] = await db.update(shopItemTypesTable).set({
    ...(name !== undefined && { name }),
    ...(basePrice !== undefined && { basePrice }),
    ...(fixedSizeSupport !== undefined && { fixedSizeSupport }),
    sizeSupportedFrom: sizeSupportedFrom || null,
    sizeSupportedTo: sizeSupportedTo || null,
  }).where(eq(shopItemTypesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.delete("/admin/shop-item-types/:id", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(shopItemTypesTable).where(eq(shopItemTypesTable.id, id));
  return res.json({ success: true });
});

// ── Art Subcategories ────────────────────────────────────────────────────────

router.get("/lookup/art-subcategories", async (req, res) => {
  const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
  const rows = categoryId
    ? await db.select().from(artSubcategoriesTable).where(eq(artSubcategoriesTable.artCategoryId, categoryId)).orderBy(artSubcategoriesTable.displayOrder)
    : await db.select().from(artSubcategoriesTable).orderBy(artSubcategoriesTable.displayOrder);
  return res.json(rows);
});

router.post("/admin/art-subcategories", requireAdminSession, async (req, res) => {
  const { artCategoryId, name } = req.body;
  if (!artCategoryId || !name) return res.status(400).json({ error: "artCategoryId and name required" });
  const existing = await db.select().from(artSubcategoriesTable).where(eq(artSubcategoriesTable.artCategoryId, artCategoryId));
  const [row] = await db.insert(artSubcategoriesTable).values({
    artCategoryId: Number(artCategoryId),
    name,
    displayOrder: existing.length,
  }).returning();
  return res.status(201).json(row);
});

router.delete("/admin/art-subcategories/:id", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(artSubcategoriesTable).where(eq(artSubcategoriesTable.id, id));
  return res.json({ success: true });
});

// ── Subcategory ↔ Shop Item Type Compatibility ───────────────────────────────

router.get("/admin/subcategory-compatibility", requireAdminSession, async (_req, res) => {
  const rows = await db.select({
    id: subcategoryCompatibilityTable.id,
    artCategoryId: subcategoryCompatibilityTable.artCategoryId,
    artSubcategoryId: subcategoryCompatibilityTable.artSubcategoryId,
    shopItemTypeId: subcategoryCompatibilityTable.shopItemTypeId,
    categoryName: artCategoriesTable.name,
    subcategoryName: artSubcategoriesTable.name,
    shopItemTypeName: shopItemTypesTable.name,
  })
  .from(subcategoryCompatibilityTable)
  .leftJoin(artCategoriesTable, eq(artCategoriesTable.id, subcategoryCompatibilityTable.artCategoryId))
  .leftJoin(artSubcategoriesTable, eq(artSubcategoriesTable.id, subcategoryCompatibilityTable.artSubcategoryId))
  .leftJoin(shopItemTypesTable, eq(shopItemTypesTable.id, subcategoryCompatibilityTable.shopItemTypeId));
  return res.json(rows);
});

router.post("/admin/subcategory-compatibility", requireAdminSession, async (req, res) => {
  const { artCategoryId, artSubcategoryId, shopItemTypeId } = req.body;
  if (!artCategoryId || !shopItemTypeId) return res.status(400).json({ error: "artCategoryId and shopItemTypeId required" });
  const [row] = await db.insert(subcategoryCompatibilityTable).values({
    artCategoryId: Number(artCategoryId),
    artSubcategoryId: artSubcategoryId ? Number(artSubcategoryId) : null,
    shopItemTypeId: Number(shopItemTypeId),
  }).returning();
  return res.status(201).json(row);
});

router.delete("/admin/subcategory-compatibility/:id", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(subcategoryCompatibilityTable).where(eq(subcategoryCompatibilityTable.id, id));
  return res.json({ success: true });
});

export default router;
