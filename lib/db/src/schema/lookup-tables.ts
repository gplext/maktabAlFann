import { pgTable, text, serial, integer, boolean } from "drizzle-orm/pg-core";

export const artworkTypesTable = pgTable("artwork_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayOrder: integer("display_order").notNull().default(0),
});

export const artSubcategoriesTable = pgTable("art_subcategories", {
  id: serial("id").primaryKey(),
  artCategoryId: integer("art_category_id").notNull().references(() => artCategoriesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
});

export const artCategoriesTable = pgTable("art_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayOrder: integer("display_order").notNull().default(0),
});

export const artStylesTable = pgTable("art_styles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayOrder: integer("display_order").notNull().default(0),
});

export const mediumsTable = pgTable("mediums", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayOrder: integer("display_order").notNull().default(0),
});

export const techniquesTable = pgTable("techniques", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayOrder: integer("display_order").notNull().default(0),
});

/** Surface / support the work is made on: canvas, paper, wood panel, wasli... */
export const baseTypesTable = pgTable("base_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayOrder: integer("display_order").notNull().default(0),
  // ── Framing properties (migration-06) ──
  /** rigid (board, panel, hard back) | flexible (stretched canvas, fabric) | loose_sheet (paper, rolled canvas, wasli) */
  rigidity: text("rigidity").notNull().default("rigid"),
  needsStretcher: boolean("needs_stretcher").notNull().default(false),
  needsGlazing: boolean("needs_glazing").notNull().default(false),
  needsBacking: boolean("needs_backing").notNull().default(false),
  /** Used when the artwork's own depth is not given. */
  typicalThicknessMm: integer("typical_thickness_mm"),
});

/** Primary paint or material: oil, acrylic, watercolour, bronze, marble... */
export const paintMaterialsTable = pgTable("paint_materials", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  /** "paint" for 2D media, "sculpture" for 3D materials, "other". */
  kind: text("kind").notNull().default("paint"),
  displayOrder: integer("display_order").notNull().default(0),
});

export const sizesTable = pgTable("sizes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  displayOrder: integer("display_order").notNull().default(0),
});

export type ArtworkType     = typeof artworkTypesTable.$inferSelect;
export type ArtSubcategory  = typeof artSubcategoriesTable.$inferSelect;
export type ArtCategory = typeof artCategoriesTable.$inferSelect;
export type ArtStyle    = typeof artStylesTable.$inferSelect;
export type Medium      = typeof mediumsTable.$inferSelect;
export type Technique   = typeof techniquesTable.$inferSelect;
export type Size        = typeof sizesTable.$inferSelect;
export type BaseType    = typeof baseTypesTable.$inferSelect;
export type PaintMaterial = typeof paintMaterialsTable.$inferSelect;
