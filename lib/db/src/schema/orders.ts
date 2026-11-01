import { pgTable, text, serial, integer, timestamp, char, index, jsonb } from "drizzle-orm/pg-core";
import { money, BASE_CURRENCY } from "./_money";
import { artworksTable } from "./artworks";
import { shopItemsTable } from "./shop_items";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  userId: text("user_id"),
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

  // ── Checkout ───────────────────────────────────────────────────────────────
  /** local | international — chosen at the checkout gate. */
  region: text("region").notNull().default("local"),
  /** web (signed-in checkout) | whatsapp (finished in a WhatsApp chat). */
  channel: text("channel").notNull().default("web"),
  /** cod | bank_transfer | card */
  paymentMethod: text("payment_method").notNull().default("cod"),
  /** unpaid | pending | paid | refunded — separate from the fulfilment status. */
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  shippingAddress: text("shipping_address"),
  shippingCity: text("shipping_city"),
  shippingCountry: text("shipping_country"),
  /** Reference quoted in the WhatsApp chat, e.g. MAF-7K3QXW. */
  whatsappRef: text("whatsapp_ref").unique(),
  confirmedAt: timestamp("confirmed_at"),
  shippedAt: timestamp("shipped_at"),
  deliveredAt: timestamp("delivered_at"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_orders_user_id").on(t.userId),
  index("idx_orders_status").on(t.status),
  index("orders_contact_phone_idx").on(t.contactPhone),
]);

export const orderLineItemsTable = pgTable("order_line_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),

  // Exactly one of these is set — enforced in the database by
  // order_line_items_one_target_check.
  artworkId: integer("artwork_id").references(() => artworksTable.id, { onDelete: "set null" }),
  shopItemId: integer("shop_item_id").references(() => shopItemsTable.id, { onDelete: "set null" }),
  /** For a frame line: the artwork it frames, and the size/spec frozen at order time (migration-06). */
  forArtworkId: integer("for_artwork_id"),
  frameSpec: jsonb("frame_spec"),

  /** Title and image as sold — deliberately frozen, not joined at read time. */
  title: text("title").notNull(),
  imageUrl: text("image_url").notNull().default(""),

  /** Price as sold, in the order's currency. */
  unitPrice: money("unit_price").notNull(),
  quantity: integer("quantity").notNull().default(1),
}, (t) => [
  index("idx_order_line_items_order").on(t.orderId),
  index("order_lines_artwork_idx").on(t.artworkId),
]);

/** One row per payment attempt (Stripe Checkout session, or a cash/bank record by staff). */
export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),             // stripe | cod | bank_transfer
  providerRef: text("provider_ref").unique(),       // Stripe Checkout session id
  amount: money("amount").notNull(),
  currency: char("currency", { length: 3 }).notNull().default(BASE_CURRENCY),
  status: text("status").notNull().default("pending"), // pending | paid | expired | failed | refunded
  recordedBy: text("recorded_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  paidAt: timestamp("paid_at"),
}, (t) => [index("payments_order_idx").on(t.orderId)]);

/** Stripe webhook events already processed (webhooks can arrive more than once). */
export const stripeEventsTable = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
});

export type Order = typeof ordersTable.$inferSelect;
export type Payment = typeof paymentsTable.$inferSelect;
export type OrderLineItem = typeof orderLineItemsTable.$inferSelect;
