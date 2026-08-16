import { pgTable, text, serial, integer, timestamp, char } from "drizzle-orm/pg-core";
import { money, BASE_CURRENCY } from "./_money";
import { artworksTable } from "./artworks";
import { shopItemsTable } from "./shop_items";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  clerkUserId: text("clerk_user_id"),
  status: text("status").notNull().default("pending_purchase"),

  /**
   * Sum of (unitPrice x quantity) across this order's line items, computed on
   * the server from catalogue prices. Never accepted from the client.
   */
  totalAmount: money("total_amount").notNull(),
  /** ISO-4217, frozen at time of sale. */
  currency: char("currency", { length: 3 }).notNull().default(BASE_CURRENCY),

  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const orderLineItemsTable = pgTable("order_line_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),

  // Exactly one of these is set — enforced in the database by
  // order_line_items_one_target_check.
  artworkId: integer("artwork_id").references(() => artworksTable.id, { onDelete: "set null" }),
  shopItemId: integer("shop_item_id").references(() => shopItemsTable.id, { onDelete: "set null" }),

  /** Title and image as sold — deliberately frozen, not joined at read time. */
  title: text("title").notNull(),
  imageUrl: text("image_url").notNull().default(""),

  /** Price as sold, in the order's currency. */
  unitPrice: money("unit_price").notNull(),
  quantity: integer("quantity").notNull().default(1),
});

export type Order = typeof ordersTable.$inferSelect;
export type OrderLineItem = typeof orderLineItemsTable.$inferSelect;
