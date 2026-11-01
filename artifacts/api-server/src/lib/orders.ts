import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  db, ordersTable, orderLineItemsTable, paymentsTable, stripeEventsTable, shopItemsTable,
  galleryCommissionTable, artworksTable, artistsTable, toMoney, type Order,
} from "@workspace/db";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { createTask } from "./tasks";
import { logger } from "./logger";

/**
 * Checkout rules in one place.
 *
 *  Local buyers:   cash on delivery (or bank transfer); card is offered only
 *                  after the order is delivered.
 *  International:  card (Stripe) before shipping.
 *  Both:           signed-in web checkout, or WhatsApp (order is created with a
 *                  reference and finished in the chat by staff).
 */
export type OrderStatus =
  | "pending_purchase" | "confirmed" | "in_preparation" | "paid" | "shipped"
  | "delivered" | "completed" | "cancelled" | "refunded";

/** Statuses that hold an artwork (an original can only be in one of these at a time). */
export const RELEASED_STATUSES = ["cancelled", "refunded"];

const TRANSITIONS: Record<string, OrderStatus[]> = {
  pending_purchase: ["confirmed", "cancelled", "refunded"],
  confirmed: ["in_preparation", "shipped", "cancelled", "refunded"],
  in_preparation: ["shipped", "cancelled", "refunded"],
  paid: ["in_preparation", "shipped", "delivered", "cancelled", "refunded"], // legacy status
  shipped: ["delivered"],
  delivered: ["completed", "refunded"],
  completed: ["refunded"],
  cancelled: [],
  refunded: [],
};

export function checkPaymentMethod(region: string, method: string): string | null {
  if (region === "international" && method !== "card") return "International orders are paid by card.";
  if (region === "local" && !["cod", "bank_transfer"].includes(method)) {
    return "Local orders are paid cash on delivery or by bank transfer. You can also pay by card after delivery.";
  }
  return null;
}

export function transitionProblem(order: Order, to: string): string | null {
  if (!(TRANSITIONS[order.status] ?? []).includes(to as OrderStatus)) {
    return `An order that is "${order.status.replace("_", " ")}" can't move to "${to.replace("_", " ")}".`;
  }
  if (to === "confirmed" && order.channel === "whatsapp" && !order.shippingAddress) {
    return "Enter the delivery address agreed in the WhatsApp chat (Staff console → Orders → Confirmed in chat).";
  }
  if (to === "shipped" && !order.shippingAddress) return "Add the delivery address before shipping.";
  if (to === "shipped" && order.region === "international" && order.paymentStatus !== "paid") {
    return "International orders must be paid before shipping.";
  }
  if (to === "completed" && order.paymentStatus !== "paid") return "Record the payment before completing the order.";
  if (to === "cancelled" && order.paymentStatus === "paid") return "This order is paid — refund it instead of cancelling.";
  if (to === "refunded" && order.paymentStatus !== "paid") return "Only paid orders can be refunded.";
  return null;
}

/** Applies a status change with its timestamps and follow-up tasks. */
export async function applyTransition(order: Order, to: OrderStatus, actor: string): Promise<Order> {
  const now = new Date();
  const [updated] = await db.update(ordersTable).set({
    status: to, updatedAt: now,
    ...(to === "confirmed" ? { confirmedAt: now } : {}),
    ...(to === "shipped" ? { shippedAt: now } : {}),
    ...(to === "delivered" ? { deliveredAt: now } : {}),
    ...(to === "refunded" ? { paymentStatus: "refunded" } : {}),
  }).where(eq(ordersTable.id, order.id)).returning();
  // Cancelled/refunded orders give their shop-item stock back (artworks free up automatically).
  if (RELEASED_STATUSES.includes(to) && !RELEASED_STATUSES.includes(order.status)) await restock(order.id);
  if (to === "shipped") {
    await createTask({ typeCode: "delivery_confirmation", title: `Confirm delivery of Order #${order.id + 10000}`, entityType: "order", entityId: order.id });
  }
  logger.info({ orderId: order.id, from: order.status, to, actor }, "Order status changed");
  return updated!;
}

/**
 * Locks the artworks for this transaction and fails if any is already held by
 * another order. Advisory locks make two buyers racing for the same piece safe.
 */
export async function assertArtworksAvailable(tx: any, artworkIds: number[]) {
  for (const id of [...artworkIds].sort((a, b) => a - b)) {
    await tx.execute(sql`select pg_advisory_xact_lock(${7_000_000 + id})`);
  }
  if (artworkIds.length === 0) return;
  const held = await tx.select({ artworkId: orderLineItemsTable.artworkId, title: orderLineItemsTable.title })
    .from(orderLineItemsTable)
    .innerJoin(ordersTable, eq(orderLineItemsTable.orderId, ordersTable.id))
    .where(and(inArray(orderLineItemsTable.artworkId, artworkIds), notInArray(ordersTable.status, RELEASED_STATUSES)))
    .limit(1);
  if (held.length) throw new ArtworkUnavailableError(held[0].title);
}

async function restock(orderId: number) {
  const lines = await db.select().from(orderLineItemsTable).where(eq(orderLineItemsTable.orderId, orderId));
  for (const l of lines) {
    if (l.shopItemId) {
      await db.update(shopItemsTable).set({ stock: sql`${shopItemsTable.stock} + ${l.quantity}` }).where(eq(shopItemsTable.id, l.shopItemId));
    }
  }
}

/** Takes shop-item stock inside the order transaction; fails if someone bought the last one first. */
export async function takeStock(tx: any, lines: { shopItemId: number | null; quantity: number; title: string }[]) {
  for (const l of lines) {
    if (!l.shopItemId) continue;
    const updated = await tx.update(shopItemsTable)
      .set({ stock: sql`${shopItemsTable.stock} - ${l.quantity}` })
      .where(and(eq(shopItemsTable.id, l.shopItemId), sql`${shopItemsTable.stock} >= ${l.quantity}`))
      .returning({ id: shopItemsTable.id });
    if (updated.length === 0) throw new ArtworkUnavailableError(l.title, "is out of stock");
  }
}

/** reserved = in an open order; sold = delivered, completed or paid. */
export async function artworkAvailability(ids: number[]): Promise<Map<number, "reserved" | "sold">> {
  const out = new Map<number, "reserved" | "sold">();
  if (ids.length === 0) return out;
  const rows = await db.select({ id: orderLineItemsTable.artworkId, status: ordersTable.status, paymentStatus: ordersTable.paymentStatus })
    .from(orderLineItemsTable).innerJoin(ordersTable, eq(orderLineItemsTable.orderId, ordersTable.id))
    .where(and(inArray(orderLineItemsTable.artworkId, ids), notInArray(ordersTable.status, RELEASED_STATUSES)));
  for (const r of rows) {
    if (r.id == null) continue;
    const sold = r.paymentStatus === "paid" || ["delivered", "completed", "paid"].includes(r.status);
    if (sold || !out.has(r.id)) out.set(r.id, sold ? "sold" : "reserved");
  }
  return out;
}

/** Open WhatsApp orders for one phone — capped so nobody can reserve the whole gallery. */
export async function openWhatsappOrders(phone: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(ordersTable)
    .where(and(eq(ordersTable.channel, "whatsapp"), eq(ordersTable.contactPhone, phone), eq(ordersTable.status, "pending_purchase")));
  return row?.n ?? 0;
}

/**
 * When an order is paid, record what the gallery keeps and what the artist earns
 * for each artwork in it (status "pending" until the artist is paid out).
 * Safe to call more than once: a row tagged with this order is never duplicated.
 */
export async function recordCommissions(orderId: number) {
  try {
    const tag = `Order #${orderId + 10000}`;
    const lines = await db.select({
      artworkId: orderLineItemsTable.artworkId, price: orderLineItemsTable.unitPrice, title: orderLineItemsTable.title,
      artistId: artworksTable.artistId, artistName: artistsTable.name, rate: artistsTable.defaultCommissionRate,
      currency: ordersTable.currency,
    }).from(orderLineItemsTable)
      .innerJoin(ordersTable, eq(orderLineItemsTable.orderId, ordersTable.id))
      .innerJoin(artworksTable, eq(orderLineItemsTable.artworkId, artworksTable.id))
      .innerJoin(artistsTable, eq(artworksTable.artistId, artistsTable.id))
      .where(eq(orderLineItemsTable.orderId, orderId));
    for (const l of lines) {
      const [exists] = await db.select({ id: galleryCommissionTable.id }).from(galleryCommissionTable)
        .where(and(eq(galleryCommissionTable.artworkId, l.artworkId!), eq(galleryCommissionTable.notes, tag))).limit(1);
      if (exists) continue;
      const rate = Number(l.rate ?? 30);
      const sale = Number(l.price);
      const commission = toMoney((sale * rate) / 100);
      await db.insert(galleryCommissionTable).values({
        artworkId: l.artworkId!, artistId: l.artistId, artworkTitle: l.title, artistName: l.artistName,
        salePrice: sale, commissionRate: rate, commissionAmount: commission, artistEarning: toMoney(sale - commission),
        currency: l.currency, notes: tag, status: "pending",
      });
    }
  } catch (err) {
    logger.error({ err, orderId }, "Commission rows not recorded");
  }
}

export class ArtworkUnavailableError extends Error {
  constructor(title: string, reason = "has just been reserved or sold to another collector") {
    super(`"${title}" ${reason}.`);
  }
}

export function newWhatsappRef(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "MAF-" + [...randomBytes(6)].map((b) => alphabet[b % alphabet.length]).join("");
}

export function whatsappLink(text: string): string | null {
  const number = (process.env.WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}

// ── Stripe (REST, no SDK) ────────────────────────────────────────────────────
export const stripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);

async function stripePost(path: string, params: Record<string, string>, idempotencyKey: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey,
    },
    body: new URLSearchParams(params),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Stripe request failed");
  return data;
}

/** Creates a Stripe Checkout session for the order's server-side total. */
export async function startCardPayment(order: Order, origin: string): Promise<string> {
  const amountMinor = Math.round(Number(order.totalAmount) * 100);
  const currency = order.currency.toLowerCase();
  const window10m = Math.floor(Date.now() / 600_000);
  const session = await stripePost("checkout/sessions", {
    mode: "payment",
    success_url: `${origin}/collector?paid=${order.id}`,
    cancel_url: `${origin}/collector?payment=cancelled&order=${order.id}`,
    client_reference_id: String(order.id),
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][unit_amount]": String(amountMinor),
    "line_items[0][price_data][product_data][name]": `Maktaba Al-Fann — Order #${order.id + 10000}`,
    "metadata[order_id]": String(order.id),
    "payment_intent_data[metadata][order_id]": String(order.id),
    ...(order.contactEmail ? { customer_email: order.contactEmail } : {}),
  }, `checkout-${order.id}-${amountMinor}-${window10m}`);

  await db.insert(paymentsTable).values({
    orderId: order.id, provider: "stripe", providerRef: session.id,
    amount: order.totalAmount, currency: order.currency, status: "pending",
  }).onConflictDoNothing();
  await db.update(ordersTable).set({ paymentMethod: "card", paymentStatus: "pending", updatedAt: new Date() })
    .where(and(eq(ordersTable.id, order.id), notInArray(ordersTable.paymentStatus, ["paid", "refunded"])));
  return session.url as string;
}

/** Stripe-Signature check: HMAC-SHA256 of `${t}.${body}`, 5-minute tolerance. */
export function verifyStripeSignature(rawBody: Buffer, header: string | undefined): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody.toString("utf8")}`).digest("hex");
  return header.split(",").filter((p) => p.startsWith("v1=")).some((p) => {
    const sig = Buffer.from(p.slice(3), "hex");
    const exp = Buffer.from(expected, "hex");
    return sig.length === exp.length && timingSafeEqual(sig, exp);
  });
}

export async function handleStripeEvent(event: any) {
  const [fresh] = await db.insert(stripeEventsTable).values({ id: String(event.id), type: String(event.type) })
    .onConflictDoNothing().returning();
  if (!fresh) return; // already processed
  const session = event.data?.object;
  if (!session?.id) return;
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.providerRef, session.id)).limit(1);
  if (!payment) {
    logger.warn({ sessionId: session.id }, "Stripe event for unknown session");
    return;
  }
  if ((event.type === "checkout.session.completed" && session.payment_status === "paid") || event.type === "checkout.session.async_payment_succeeded") {
    const expectedMinor = Math.round(Number(payment.amount) * 100);
    if (session.amount_total !== expectedMinor || String(session.currency).toUpperCase() !== payment.currency) {
      logger.error({ paymentId: payment.id, got: session.amount_total, expectedMinor }, "Stripe amount mismatch — not marking paid");
      await db.update(paymentsTable).set({ status: "failed" }).where(eq(paymentsTable.id, payment.id));
      return;
    }
    const now = new Date();
    await db.update(paymentsTable).set({ status: "paid", paidAt: now }).where(eq(paymentsTable.id, payment.id));
    const [order] = await db.update(ordersTable).set({ paymentStatus: "paid", paidAt: now, updatedAt: now })
      .where(eq(ordersTable.id, payment.orderId)).returning();
    await recordCommissions(payment.orderId);
    if (order?.status === "delivered") await applyTransition(order, "completed", "stripe");
    logger.info({ orderId: payment.orderId }, "Card payment received");
  } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    await db.update(paymentsTable).set({ status: event.type.endsWith("expired") ? "expired" : "failed" }).where(eq(paymentsTable.id, payment.id));
    await db.update(ordersTable).set({ paymentStatus: "unpaid", updatedAt: new Date() })
      .where(and(eq(ordersTable.id, payment.orderId), eq(ordersTable.paymentStatus, "pending")));
  }
}

/** Releases artworks held by orders that were never followed up. */
export async function expireStaleOrders() {
  try {
    const now = Date.now();
    const stale = await db.update(ordersTable).set({ status: "cancelled", updatedAt: new Date() }).where(and(
      eq(ordersTable.status, "pending_purchase"),
      sql`(
        (${ordersTable.channel} = 'whatsapp' AND ${ordersTable.createdAt} < ${new Date(now - 48 * 3_600_000)})
        OR (${ordersTable.region} = 'international' AND ${ordersTable.paymentStatus} <> 'paid' AND ${ordersTable.createdAt} < ${new Date(now - 24 * 3_600_000)})
      )`,
    )).returning({ id: ordersTable.id });
    if (stale.length) logger.info({ ids: stale.map((s) => s.id) }, "Stale orders cancelled (artworks released)");
  } catch (err) {
    logger.error({ err }, "Order expiry run failed");
  }
}

let started = false;
export function startOrderScheduler() {
  if (started) return;
  started = true;
  setInterval(() => void expireStaleOrders(), 30 * 60_000).unref();
}

