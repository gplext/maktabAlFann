import { pgTable, text, serial, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const artistsTable = pgTable("artists", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").unique(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  birthYear: integer("birth_year").notNull(),
  gender: text("gender").notNull(),
  style: text("style").notNull(),
  photoUrl: text("photo_url").notNull(),
  shortBio: text("short_bio").notNull(),
  biography: text("biography").notNull(),
  influences: text("influences").notNull(),
  awards: text("awards").notNull().default(""),
  exhibitions: text("exhibitions").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  websiteUrl: text("website_url").notNull().default(""),
  isVerified: text("is_verified").notNull().default("pending"),
  portfolioDisabled: boolean("portfolio_disabled").notNull().default(false),
  saying: text("saying").notNull().default(""),
  sayingAuthor: text("saying_author").notNull().default(""),
  defaultCommissionRate: integer("default_commission_rate").notNull().default(30),
  phone:  text("phone").notNull().default(""),
  phone2: text("phone2").notNull().default(""),
  riskScore: integer("risk_score").notNull().default(0),
  riskFlags: jsonb("risk_flags").notNull().default([]),
  reviewedBy: text("reviewed_by").notNull().default(""),
  reviewedAt: timestamp("reviewed_at"),
});

export const insertArtistSchema = createInsertSchema(artistsTable).omit({ id: true });
export type InsertArtist = z.infer<typeof insertArtistSchema>;
export type Artist = typeof artistsTable.$inferSelect;
