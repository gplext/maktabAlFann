import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { artistsTable } from "./artists";

export const artistClaimsTable = pgTable("artist_claims", {
  id:             serial("id").primaryKey(),
  artistId:       integer("artist_id").notNull().references(() => artistsTable.id),
  clerkUserId:    text("clerk_user_id").notNull(),
  submittedPhone: text("submitted_phone").notNull().default(""),
  phoneMatched:   boolean("phone_matched").notNull().default(false),
  status:         text("status").notNull().default("pending"),   // pending | auto_verified | approved | rejected
  adminNote:      text("admin_note").notNull().default(""),
  riskScore:      integer("risk_score").notNull().default(0),
  riskFlags:      jsonb("risk_flags").notNull().default([]),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});
