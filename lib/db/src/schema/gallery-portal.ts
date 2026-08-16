import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { artistsTable } from "./artists";
import { artworksTable } from "./artworks";

export const galleriesTable = pgTable("galleries", {
  id:          serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  name:        text("name").notNull(),
  description: text("description").notNull().default(""),
  email:       text("email").notNull().default(""),
  phone:       text("phone").notNull().default(""),
  city:        text("city").notNull().default(""),
  country:     text("country").notNull().default("Pakistan"),
  websiteUrl:  text("website_url").notNull().default(""),
  logoUrl:     text("logo_url").notNull().default(""),
  status:      text("status").notNull().default("pending"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

export const galleryArtistsTable = pgTable(
  "gallery_artists",
  {
    id:        serial("id").primaryKey(),
    galleryId: integer("gallery_id").notNull().references(() => galleriesTable.id),
    artistId:  integer("artist_id").notNull().references(() => artistsTable.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("gallery_artists_uniq").on(t.galleryId, t.artistId)],
);

export const galleryArtworksTable = pgTable(
  "gallery_artworks",
  {
    id:        serial("id").primaryKey(),
    galleryId: integer("gallery_id").notNull().references(() => galleriesTable.id),
    artworkId: integer("artwork_id").notNull().references(() => artworksTable.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("gallery_artworks_uniq").on(t.galleryId, t.artworkId)],
);
