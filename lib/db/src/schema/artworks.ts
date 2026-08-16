import { pgTable, text, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { money } from "./_money";
import { artistsTable } from "./artists";
import {
  artCategoriesTable,
  artStylesTable,
  artSubcategoriesTable,
  sizesTable,
  techniquesTable,
} from "./lookup-tables";

export const artworksTable = pgTable("artworks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  artistId: integer("artist_id").notNull().references(() => artistsTable.id),

  // ── Classification ────────────────────────────────────────────────────────
  // These were free-text columns until migration-04. They are real references
  // now — the category filter on /art depends on it.
  artCategoryId: integer("art_category_id").notNull().references(() => artCategoriesTable.id),
  artStyleId: integer("art_style_id").references(() => artStylesTable.id),
  sizeId: integer("size_id").references(() => sizesTable.id),
  techniqueId: integer("technique_id").references(() => techniquesTable.id),
  artSubcategoryId: integer("art_subcategory_id").references(() => artSubcategoriesTable.id),

  // Free text on purpose: descriptive prose no lookup list can express
  // ("Watercolor and gold leaf on paper"), shown verbatim on the artwork page.
  medium: text("medium").notNull().default(""),
  theme: text("theme").notNull(),

  year: integer("year").notNull(),
  imageUrl: text("image_url").notNull(),
  thumbnailUrl: text("thumbnail_url").notNull(),
  shortDescription: text("short_description").notNull(),
  history: text("history").notNull().default(""),
  styleExplanation: text("style_explanation").notNull().default(""),
  culturalContext: text("cultural_context").notNull().default(""),

  // Free-text measurement (e.g. `24" x 36"`). Drives the 3D frame viewer's
  // aspect ratio; sizeId is the filterable bucket.
  dimensions: text("dimensions").notNull().default(""),
  widthCm: integer("width_cm"),
  heightCm: integer("height_cm"),

  isFeatured: boolean("is_featured").notNull().default(false),
  timeline: jsonb("timeline").notNull().default([]),
  status: text("status").notNull().default("approved"),
  submittedByClerkId: text("submitted_by_clerk_id"),
  specialtyType: text("specialty_type"),
  tagline: text("tagline"),

  frameIncluded: boolean("frame_included").notNull().default(false),
  frameDescription: text("frame_description"),

  // ── Money (PKR, numeric(12,2) — see ./_money.ts) ──────────────────────────
  /** What the artist expects to receive. */
  expectedPrice: money("expected_price"),
  /** Public price. Always computed server-side — never accepted from a client. */
  displayPrice: money("display_price"),
});

export const insertArtworkSchema = createInsertSchema(artworksTable).omit({ id: true });
export type InsertArtwork = z.infer<typeof insertArtworkSchema>;
export type Artwork = typeof artworksTable.$inferSelect;
