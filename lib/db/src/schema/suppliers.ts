import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { artworksTable } from "./artworks";

export const storageLocationsTable = pgTable("storage_locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  artworkId: integer("artwork_id").notNull().unique().references(() => artworksTable.id, { onDelete: "cascade" }),
  storageLocationId: integer("storage_location_id").notNull().references(() => storageLocationsTable.id),
  contactPerson: text("contact_person").notNull().default(""),
  phone1: text("phone1").notNull().default(""),
  phone2: text("phone2"),
  email: text("email"),
  address: text("address").notNull().default(""),
  city: text("city").notNull().default(""),
  googleMap: text("google_map"),
});

export type StorageLocation = typeof storageLocationsTable.$inferSelect;
export type Supplier = typeof suppliersTable.$inferSelect;
