import { pgTable, text, serial, jsonb, timestamp } from "drizzle-orm/pg-core";

export const enquiriesTable = pgTable("enquiries", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  userEmail: text("user_email").notNull(),
  userName: text("user_name").notNull().default(""),
  items: jsonb("items").notNull(),
  message: text("message").default(""),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
