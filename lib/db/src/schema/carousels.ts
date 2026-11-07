import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Admin → Carousels (migration-09). One row per carousel on the site, keyed by a
 * fixed slug (see CAROUSELS in api-server/src/lib/carousels.ts).
 * `items` = ids shown, in order. `pool` = ids the last algorithm run picked.
 * Ids are artwork ids or artist ids, depending on the carousel.
 */
export const siteCarouselsTable = pgTable("site_carousels", {
  key: text("key").primaryKey(),
  mode: text("mode").notNull().default("latest"),
  galleryId: integer("gallery_id"),
  poolSize: integer("pool_size").notNull().default(15),
  showCount: integer("show_count").notNull().default(10),
  pool: jsonb("pool").$type<number[]>().notNull().default([]),
  items: jsonb("items").$type<number[]>().notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SiteCarousel = typeof siteCarouselsTable.$inferSelect;
