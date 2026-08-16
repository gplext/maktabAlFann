import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";

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
