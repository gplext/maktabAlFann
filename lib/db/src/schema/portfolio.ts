import { pgTable, text, serial, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { artistsTable } from "./artists";

export type AdminPortfolioItem = { url: string; label?: string };

export const portfolioTable = pgTable("portfolio", {
  id: serial("id").primaryKey(),
  artistId: integer("artist_id").notNull().unique().references(() => artistsTable.id),
  description: text("description").notNull().default(""),
  imageUrls: jsonb("image_urls").$type<string[]>().notNull().default([]),
  adminItems: jsonb("admin_items").$type<AdminPortfolioItem[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPortfolioSchema = createInsertSchema(portfolioTable).omit({ id: true, createdAt: true });
export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;
export type Portfolio = typeof portfolioTable.$inferSelect;
