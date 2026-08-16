import { pgTable, text, serial, integer, timestamp, char } from "drizzle-orm/pg-core";
import { money, BASE_CURRENCY } from "./_money";
import { artistsTable } from "./artists";
import { artworksTable } from "./artworks";

export const galleryCommissionTable = pgTable("gallery_commission", {
  id: serial("id").primaryKey(),
  artworkId: integer("artwork_id").notNull().references(() => artworksTable.id),
  artistId: integer("artist_id").notNull().references(() => artistsTable.id),

  /** Title and name as they stood at the time of sale — a frozen record. */
  artworkTitle: text("artwork_title").notNull().default(""),
  artistName: text("artist_name").notNull().default(""),

  salePrice: money("sale_price").notNull(),
  commissionRate: integer("commission_rate").notNull().default(30),
  commissionAmount: money("commission_amount").notNull(),
  artistEarning: money("artist_earning").notNull(),

  /**
   * ISO-4217, frozen at time of sale.
   *
   * This column used to default to 'AED' while routes/gallery-commission.ts
   * passed 'PKR' — the two disagreed silently. PKR is the gallery's base
   * currency; migration-03 fixed the default and normalised existing rows.
   */
  currency: char("currency", { length: 3 }).notNull().default(BASE_CURRENCY),

  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type GalleryCommission = typeof galleryCommissionTable.$inferSelect;
