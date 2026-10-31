import { pgTable, text, serial, integer, primaryKey } from "drizzle-orm/pg-core";
import { artworksTable } from "./artworks";

export const tagsTable = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const artworkTagsTable = pgTable(
  "artwork_tags",
  {
    artworkId: integer("artwork_id").notNull().references(() => artworksTable.id, { onDelete: "cascade" }),
    tagId: integer("tag_id").notNull().references(() => tagsTable.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.artworkId, table.tagId] })],
);

export type Tag = typeof tagsTable.$inferSelect;
