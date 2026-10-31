import { pgTable, text, serial, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const galleryAboutTable = pgTable("gallery_about", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  founded: integer("founded").notNull(),
  mission: text("mission").notNull(),
  history: text("history").notNull(),
  vision: text("vision").notNull(),
  team: jsonb("team").notNull().default([]),
});

export const insertGalleryAboutSchema = createInsertSchema(galleryAboutTable).omit({ id: true });
export type InsertGalleryAbout = z.infer<typeof insertGalleryAboutSchema>;
export type GalleryAbout = typeof galleryAboutTable.$inferSelect;
