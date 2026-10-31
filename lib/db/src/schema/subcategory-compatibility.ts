import { pgTable, serial, integer } from "drizzle-orm/pg-core";
import { artCategoriesTable, artSubcategoriesTable } from "./lookup-tables";
import { shopItemTypesTable } from "./shop-item-types";

// Links an art subcategory (or null = all subcategories) to a shop item type
export const subcategoryCompatibilityTable = pgTable("subcategory_compatibility", {
  id: serial("id").primaryKey(),
  artCategoryId: integer("art_category_id").notNull().references(() => artCategoriesTable.id, { onDelete: "cascade" }),
  artSubcategoryId: integer("art_subcategory_id").references(() => artSubcategoriesTable.id, { onDelete: "cascade" }), // null = applies to all subcategories in this category
  shopItemTypeId: integer("shop_item_type_id").notNull().references(() => shopItemTypesTable.id, { onDelete: "cascade" }),
});

export type SubcategoryCompatibility = typeof subcategoryCompatibilityTable.$inferSelect;
