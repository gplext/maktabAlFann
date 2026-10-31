import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  firstName: text("first_name").default(""),
  lastName: text("last_name").default(""),
  role: text("role").notNull().default("collector"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
