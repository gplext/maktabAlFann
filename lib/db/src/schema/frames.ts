import { pgTable, text, serial, integer, boolean, real } from "drizzle-orm/pg-core";
import { artCategoriesTable, baseTypesTable } from "./lookup-tables";

/**
 * A frame moulding: everything needed to check fit, work out the final size and draw it in 3D.
 * All measurements are millimetres.
 */
export const frameProfilesTable = pgTable("frame_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  /** standard | thin | wide | enclosing | floater */
  style: text("style").notNull().default("standard"),
  /** wood | metal | polystyrene | other */
  material: text("material").notNull().default("wood"),
  /** flat | bevel | rounded | ornate — shape of the moulding face (3D). */
  profileShape: text("profile_shape").notNull().default("flat"),
  /** Visible width of the moulding, seen from the front. */
  faceWidthMm: integer("face_width_mm").notNull(),
  /** How far the frame stands off the wall. */
  depthMm: integer("depth_mm").notNull(),
  /** How much the front lip overlaps the artwork edge (0 for floaters). */
  rebateWidthMm: integer("rebate_width_mm").notNull().default(5),
  /** Space inside the frame for the artwork (+ glass + backing). */
  rebateDepthMm: integer("rebate_depth_mm").notNull(),
  /** Empty "shadow gap" between artwork edge and frame (floaters). 0 = none. */
  revealGapMm: integer("reveal_gap_mm").notNull().default(0),
  revealColourHex: text("reveal_colour_hex").notNull().default("#111111"),
  /** Limits for this moulding. Null = no limit. */
  maxLongEdgeMm: integer("max_long_edge_mm"),
  maxWeightG: integer("max_weight_g"),
  // ── 3D look ──
  colourHex: text("colour_hex").notNull().default("#8B6914"),
  metalness: real("metalness").notNull().default(0.3),
  roughness: real("roughness").notNull().default(0.5),
  textureUrl: text("texture_url"),
  active: boolean("active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
});

/**
 * Which artworks a frame profile may be used with. Empty fields match everything.
 * Any matching "deny" row blocks; if a profile has "allow" rows, the artwork must match one of them.
 */
export const frameCompatibilityTable = pgTable("frame_compatibility", {
  id: serial("id").primaryKey(),
  frameProfileId: integer("frame_profile_id").notNull().references(() => frameProfilesTable.id, { onDelete: "cascade" }),
  artCategoryId: integer("art_category_id").references(() => artCategoriesTable.id, { onDelete: "cascade" }),
  baseTypeId: integer("base_type_id").references(() => baseTypesTable.id, { onDelete: "cascade" }),
  allow: boolean("allow").notNull().default(true),
});

/** Coating on the painted surface: affects glazing and how it renders in 3D. */
export const surfaceFinishesTable = pgTable("surface_finishes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  /** False for finishes that must not sit behind glass (resin, thick impasto…). */
  glazingOk: boolean("glazing_ok").notNull().default(true),
  /** 0 = matte … 1 = high gloss (3D roughness = 1 − gloss). */
  gloss: real("gloss").notNull().default(0.3),
  displayOrder: integer("display_order").notNull().default(0),
});

export type FrameProfile = typeof frameProfilesTable.$inferSelect;
export type FrameCompatibility = typeof frameCompatibilityTable.$inferSelect;
export type SurfaceFinish = typeof surfaceFinishesTable.$inferSelect;
