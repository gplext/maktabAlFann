import { pgTable, text, integer, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import { authAccountsTable } from "./auth";

/**
 * Virtual museums for the buyer portal. Rooms are generated in the browser from
 * `preset` (size, materials, lighting), so no 3D model files are needed; a
 * `modelUrl` (GLB) can be added later for a hand-made scene.
 */
export const museumsTable = pgTable("museums", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  preset: jsonb("preset").notNull(),
  modelUrl: text("model_url"),
  displayOrder: integer("display_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

/** One saved layout per buyer: chosen museum, wall colour and which artwork hangs in which slot. */
export const buyerMuseumLayoutsTable = pgTable("buyer_museum_layouts", {
  accountId: text("account_id").primaryKey().references(() => authAccountsTable.id, { onDelete: "cascade" }),
  museumCode: text("museum_code").notNull().references(() => museumsTable.code),
  wallColor: text("wall_color"),
  /** { "N0": 12, "E1": 40 } — slot id → artwork id */
  slots: jsonb("slots").notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Museum = typeof museumsTable.$inferSelect;
