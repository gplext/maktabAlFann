import { pgTable, text, serial, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { money } from "./_money";

export const shopItemTypesTable = pgTable("shop_item_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  basePrice: money("base_price").notNull().default(0),
  fixedSizeSupport: boolean("fixed_size_support").notNull().default(false),
  sizeSupportedFrom: text("size_supported_from"),
  sizeSupportedTo: text("size_supported_to"),
  displayOrder: integer("display_order").notNull().default(0),
});

export const insertShopItemTypeSchema = createInsertSchema(shopItemTypesTable).omit({ id: true });
export type InsertShopItemType = z.infer<typeof insertShopItemTypeSchema>;
export type ShopItemType = typeof shopItemTypesTable.$inferSelect;
