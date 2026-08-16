import { pgTable, text, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { money } from "./_money";

export const shopItemsTable = pgTable("shop_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  type: text("type").notNull(),
  imageUrl: text("image_url").notNull().default(""),
  isAddon: boolean("is_addon").notNull().default(false),
  compatibleArtCategories: jsonb("compatible_art_categories").$type<string[]>().notNull().default([]),
  stock: integer("stock").notNull().default(0),
  status: text("status").notNull().default("active"),
  /** Add-on price in the gallery base currency (PKR). */
  price: money("price").notNull().default(0),
});

export const insertShopItemSchema = createInsertSchema(shopItemsTable).omit({ id: true });
export type InsertShopItem = z.infer<typeof insertShopItemSchema>;
export type ShopItem = typeof shopItemsTable.$inferSelect;
