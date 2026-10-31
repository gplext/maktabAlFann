import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { artistsTable } from "./artists";

export const artistMergeRequestsTable = pgTable("artist_merge_requests", {
  id:             serial("id").primaryKey(),
  artistId:       integer("artist_id").references(() => artistsTable.id),
  submittedName:  text("submitted_name").notNull().default(""),
  submittedEmail: text("submitted_email").notNull().default(""),
  submittedPhone: text("submitted_phone").notNull().default(""),
  message:        text("message").notNull().default(""),
  status:         text("status").notNull().default("pending"), // pending | reviewed | approved | rejected
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});
