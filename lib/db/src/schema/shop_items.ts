import { pgTable, text, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { money } from "./_money";
import { frameProfilesTable } from "./frames";

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

  // ── Frame details (only for frames; migration-06) ──
  frameProfileId: integer("frame_profile_id").references(() => frameProfilesTable.id, { onDelete: "set null" }),
  /** Opening size of a ready-made frame. Empty = made to measure. */
  innerWidthMm: integer("inner_width_mm"),
  innerHeightMm: integer("inner_height_mm"),
  /** none | glass | acrylic | anti_reflective */
  glazing: text("glazing").notNull().default("none"),
  matWidthMm: integer("mat_width_mm").notNull().default(0),
  matColourHex: text("mat_colour_hex").notNull().default("#F5EDD8"),
  /** none | hardboard | foam_board */
  backing: text("backing").notNull().default("none"),
  /** Overrides the profile's shadow gap. */
  revealGapMm: integer("reveal_gap_mm"),
  /** Made-to-measure: price + metres of moulding × this. */
  pricePerMetre: money("price_per_metre"),
});

export const insertShopItemSchema = createInsertSchema(shopItemsTable).omit({ id: true });
export type InsertShopItem = z.infer<typeof insertShopItemSchema>;
export type ShopItem = typeof shopItemsTable.$inferSelect;
