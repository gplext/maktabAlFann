import { framesForArtworks, isFrameType } from "../lib/frames";
import { Router, type IRouter } from "express";
import { createTask, onOrderCreated } from "../lib/tasks";
import { rateLimit } from "../lib/rateLimit";
import { requirePermission, type StaffContext } from "../lib/permissions";
import { parseIdentifier } from "./auth";
import {
  ArtworkUnavailableError, applyTransition, assertArtworksAvailable, checkPaymentMethod, openWhatsappOrders, takeStock, recordCommissions,
  newWhatsappRef, startCardPayment, startOrderScheduler, stripeEnabled, transitionProblem,
  whatsappLink, type OrderStatus,
} from "../lib/orders";
import { eq, desc, and, isNull, inArray } from "drizzle-orm";
import { getUserId } from "../lib/auth";
import {
  db,
  ordersTable,
  orderLineItemsTable,
  paymentsTable,
  artworksTable,
  artistsTable,
  shopItemsTable,
  toMoney,
  BASE_CURRENCY,
} from "@workspace/db";
import {
  CreateOrderBody,
  ListOrdersQueryParams,
  UpdateOrderStatusBody,
} from "@workspace/api-zod";
import { requireAdminSession } from "./admin-auth";
import { formatZodError } from "../lib/validation";

const router: IRouter = Router();

/** Rejects non-numeric :id params with 404 instead of a database error. */
router.param("id", (req, res, next, value) => {
  if (!/^\d{1,9}$/.test(String(value)) && !String(value).startsWith("u_")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
});
startOrderScheduler();

const orderLimit = rateLimit({ name: "orders-create", limit: 20, windowMs: 60 * 60_000 });

/**
 * Original artworks are unique — an order line for one can only ever be a
 * quantity of one. Add-ons (frames, hanging hardware) can be bought in bulk.
 */
const MAX_ARTWORK_QUANTITY = 1;

/* ── Create order ──────────────────────────────────────────────────────────
 *
 * The client sends artwork / shop-item ids and quantities. It does NOT send
 * prices, and any it did send are ignored: every unit price is read from the
 * catalogue and the total is summed here. Before this, `unitPrice` and
 * `totalAmount` came straight from the request body, so a crafted request could
 * buy a PKR 420,000 painting for 1.
 */
/** Which checkout options are switched on (keys present in .env), so the cart can hide the rest. */
router.get("/orders/checkout-options", (_req, res) => {
  res.json({ card: stripeEnabled(), whatsapp: Boolean(whatsappLink("")) });
});

router.post("/orders", orderLimit, async (req, res) => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) });
  }

  const { sessionId, contactName, contactPhone, contactEmail, items } = parsed.data;

  // Identity comes from the signed-in session, never from the request body — an
  // attacker must not be able to file an order against someone else's account.
  // Guests order anonymously; GET /orders links the order to their account the
  // first time they sign in from the same browser session.
  const userId = getUserId(req) ?? null;

  // ── Checkout gate: region, path and payment method ──────────────────────
  const region = parsed.data.region ?? "local";
  const channel = parsed.data.channel ?? "web";
  const paymentMethod = parsed.data.paymentMethod ?? (region === "international" ? "card" : "cod");
  const methodProblem = checkPaymentMethod(region, paymentMethod);
  if (methodProblem) return res.status(400).json({ error: methodProblem });
  if (channel === "web" && !userId) {
    return res.status(401).json({ error: "Please sign in or create an account to place an order." });
  }
  const phone = contactPhone ? parseIdentifier(contactPhone) : null;
  if (channel === "whatsapp" && (!contactName || phone?.kind !== "phone")) {
    return res.status(400).json({ error: "Enter your name and a valid WhatsApp number." });
  }
  if (channel === "whatsapp" && phone?.kind === "phone" && (await openWhatsappOrders(phone.value)) >= 2) {
    return res.status(429).json({ error: "You already have open WhatsApp orders. Please finish those in the chat first." });
  }
  if (channel === "whatsapp" && !whatsappLink("")) {
    return res.status(503).json({ error: "WhatsApp ordering is not set up yet. Please sign in to order." });
  }
  if (region === "international" && channel === "web" && (!parsed.data.shippingAddress?.trim() || !parsed.data.shippingCountry?.trim())) {
    return res.status(400).json({ error: "Enter your full delivery address and country." });
  }
  if (region === "international" && channel === "web" && !stripeEnabled()) {
    return res.status(503).json({ error: "Card payments are not available yet. Please order through WhatsApp." });
  }

  const artworkIds = [...new Set(items.filter((i) => i.artworkId != null).map((i) => i.artworkId!))];
  const shopItemIds = [...new Set(items.filter((i) => i.shopItemId != null).map((i) => i.shopItemId!))];

  // ── Look up the real prices ─────────────────────────────────────────────
  const artworks = artworkIds.length
    ? await db
        .select({
          id: artworksTable.id,
          title: artworksTable.title,
          imageUrl: artworksTable.imageUrl,
          displayPrice: artworksTable.displayPrice,
          status: artworksTable.status,
          artistVerified: artistsTable.isVerified,
        })
        .from(artworksTable)
        .innerJoin(artistsTable, eq(artworksTable.artistId, artistsTable.id))
        .where(inArray(artworksTable.id, artworkIds))
    : [];

  const shopItems = shopItemIds.length
    ? await db
        .select({
          id: shopItemsTable.id,
          name: shopItemsTable.name,
          imageUrl: shopItemsTable.imageUrl,
          price: shopItemsTable.price,
          status: shopItemsTable.status,
          stock: shopItemsTable.stock,
          type: shopItemsTable.type,
        })
        .from(shopItemsTable)
        .where(inArray(shopItemsTable.id, shopItemIds))
    : [];

  const artworkById = new Map(artworks.map((a) => [a.id, a]));
  const shopItemById = new Map(shopItems.map((s) => [s.id, s]));

  // ── Validate every line before writing anything ─────────────────────────
  const problems: string[] = [];
  const lines: {
    artworkId: number | null;
    shopItemId: number | null;
    title: string;
    imageUrl: string;
    unitPrice: number;
    quantity: number;
    forArtworkId?: number | null;
    frameSpec?: unknown;
  }[] = [];
  // Frames that belong to an artwork in this order: check the fit and price them for that artwork.
  const framePairs = items.filter((i) => i.shopItemId != null && i.forArtworkId != null);
  const frameChecks = framePairs.length
    ? await framesForArtworks([...new Set(framePairs.map((i) => i.forArtworkId!))], framePairs.map((i) => i.shopItemId!))
    : new Map();

  for (const item of items) {
    if (item.artworkId != null) {
      const artwork = artworkById.get(item.artworkId);
      if (!artwork) {
        problems.push(`Artwork ${item.artworkId} does not exist.`);
        continue;
      }
      if (artwork.status !== "approved" || artwork.artistVerified !== "approved") {
        problems.push(`"${artwork.title}" is not currently available.`);
        continue;
      }
      if (artwork.displayPrice == null) {
        problems.push(`"${artwork.title}" is price-on-request — please enquire instead.`);
        continue;
      }
      if (item.quantity > MAX_ARTWORK_QUANTITY) {
        problems.push(`"${artwork.title}" is an original — only one can be ordered.`);
        continue;
      }
      lines.push({
        artworkId: artwork.id,
        shopItemId: null,
        title: artwork.title,
        imageUrl: artwork.imageUrl,
        unitPrice: artwork.displayPrice,
        quantity: item.quantity,
      });
    } else {
      const shopItem = shopItemById.get(item.shopItemId!);
      if (!shopItem) {
        problems.push(`Item ${item.shopItemId} does not exist.`);
        continue;
      }
      if (shopItem.status !== "active") {
        problems.push(`"${shopItem.name}" is no longer available.`);
        continue;
      }
      if (shopItem.stock < item.quantity) {
        problems.push(`"${shopItem.name}" has only ${shopItem.stock} left in stock.`);
        continue;
      }
      let unitPrice = shopItem.price;
      let frameSpec: unknown = undefined;
      if (isFrameType(shopItem.type) && item.forArtworkId != null) {
        if (!items.some((i) => i.artworkId === item.forArtworkId)) {
          problems.push(`"${shopItem.name}" must be ordered with the artwork it frames.`);
          continue;
        }
        const check = (frameChecks.get(item.forArtworkId) ?? []).find((f: any) => f.spec.shopItemId === shopItem.id);
        if (!check || !check.compatible) {
          problems.push(`"${shopItem.name}" doesn't fit the selected artwork${check?.reasons?.[0] ? `: ${check.reasons[0]}` : "."}`);
          continue;
        }
        unitPrice = check.spec.price;
        frameSpec = check.spec;
      }
      lines.push({
        artworkId: null,
        shopItemId: shopItem.id,
        title: shopItem.name,
        imageUrl: shopItem.imageUrl,
        unitPrice,
        quantity: item.quantity,
        forArtworkId: item.forArtworkId ?? null,
        frameSpec: frameSpec ?? null,
      });
    }
  }

  if (problems.length > 0) {
    return res.status(400).json({ error: problems[0], problems });
  }

  // A duplicate artwork in one order would mean selling the same original twice.
  const orderedArtworkIds = lines.filter((l) => l.artworkId != null).map((l) => l.artworkId);
  if (new Set(orderedArtworkIds).size !== orderedArtworkIds.length) {
    return res.status(400).json({ error: "The same artwork appears more than once in this order." });
  }

  const totalAmount = toMoney(lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0));

  // ── Write order + lines atomically ──────────────────────────────────────
  let order: typeof ordersTable.$inferSelect;
  try {
  order = await db.transaction(async (tx) => {
    await assertArtworksAvailable(tx, orderedArtworkIds as number[]);
    await takeStock(tx, lines);
    const [created] = await tx
      .insert(ordersTable)
      .values({
        sessionId,
        userId,
        totalAmount,
        currency: BASE_CURRENCY,
        status: "pending_purchase",
        contactName: contactName ?? null,
        contactPhone: contactPhone ?? null,
        contactEmail: contactEmail ?? null,
        ...(phone?.kind === "phone" ? { contactPhone: phone.value } : {}),
        region,
        channel,
        paymentMethod,
        shippingAddress: parsed.data.shippingAddress?.trim() || null,
        shippingCity: parsed.data.shippingCity?.trim() || null,
        shippingCountry: parsed.data.shippingCountry?.trim() || (region === "local" ? "Pakistan" : null),
        whatsappRef: channel === "whatsapp" ? newWhatsappRef() : null,
      })
      .returning();

    await tx.insert(orderLineItemsTable).values(
      lines.map((l) => ({ ...l, orderId: created!.id })),
    );

    return created!;
  });
  } catch (err) {
    if (err instanceof ArtworkUnavailableError) return res.status(409).json({ error: err.message });
    throw err;
  }

  const savedLines = await db
    .select()
    .from(orderLineItemsTable)
    .where(eq(orderLineItemsTable.orderId, order.id));

  req.log?.info(
    { orderId: order.id, totalAmount, lineCount: savedLines.length },
    "Order created",
  );
  void onOrderCreated(order, savedLines);
  if (region === "international") {
    void createTask({ typeCode: "international_order_check", title: `Check international Order #${order.id + 10000} (${order.shippingCountry ?? "abroad"})`, entityType: "order", entityId: order.id });
  }

  let whatsappUrl: string | null = null;
  if (channel === "whatsapp") {
    const itemsText = savedLines.map((l) => `• ${l.title} — ${order.currency} ${Number(l.unitPrice).toLocaleString()}`).join("\n");
    whatsappUrl = whatsappLink(
      `Assalam o Alaikum! I'd like to buy from Maktaba Al-Fann.\n\nOrder ref: ${order.whatsappRef}\n${itemsText}\nTotal: ${order.currency} ${Number(order.totalAmount).toLocaleString()}\n` +
      `Buyer: ${order.contactName}\nLocation: ${[order.shippingCity, order.shippingCountry].filter(Boolean).join(", ") || (region === "local" ? "Pakistan" : "International")}\n` +
      `Payment: ${region === "international" ? "card" : "cash on delivery"}`,
    );
  }

  return res.status(201).json({ ...order, items: savedLines, whatsappUrl });
});

/* ── Read orders for a session or Clerk user ─────────────────────────────── */

router.get("/orders", async (req, res) => {
  const parsed = ListOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "sessionId or userId required" });
  }
  const { sessionId } = parsed.data;

  // A caller may only read their OWN orders. The signed-in user's id comes from
  // the signed-in session; a userId in the query string is honoured only when
  // it matches, so nobody can list another collector's order history.
  const userId = getUserId(req) ?? null;

  if (parsed.data.userId && parsed.data.userId !== userId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!userId && !sessionId) {
    return res.status(400).json({ error: "sessionId or userId required" });
  }

  // When a signed-in user fetches their orders, claim any anonymous orders from
  // this browser session. This is how a guest checkout becomes part of their
  // account once they sign in.
  if (userId && sessionId) {
    await db
      .update(ordersTable)
      .set({ userId })
      .where(and(eq(ordersTable.sessionId, sessionId), isNull(ordersTable.userId)));
  }

  const orders = userId
    ? await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.userId, userId))
        .orderBy(desc(ordersTable.createdAt))
    // Guest: only unclaimed orders, so orders already claimed by an account
    // never leak through on a shared browser.
    : await db
        .select()
        .from(ordersTable)
        .where(and(eq(ordersTable.sessionId, sessionId!), isNull(ordersTable.userId)))
        .orderBy(desc(ordersTable.createdAt));

  return res.json(await attachLineItems(orders));
});

/* ── Buyer: pay by card, confirm delivery ────────────────────────────────── */

async function ownOrder(req: any, id: number) {
  const userId = getUserId(req);
  if (!userId || Number.isNaN(id)) return null;
  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, userId))).limit(1);
  return order ?? null;
}

router.post("/orders/:id/pay", orderLimit, async (req, res) => {
  const order = await ownOrder(req, Number(req.params.id));
  if (!order) return res.status(404).json({ error: "Order not found." });
  if (order.paymentStatus === "paid") return res.status(409).json({ error: "This order is already paid." });
  if (["cancelled", "refunded"].includes(order.status)) return res.status(409).json({ error: "This order is closed." });
  // Local buyers pay by card only once the artwork has reached them.
  if (order.region === "local" && order.status !== "delivered") {
    return res.status(409).json({ error: "Card payment opens once your order is delivered." });
  }
  if (!stripeEnabled()) return res.status(503).json({ error: "Card payments are not available yet." });
  try {
    const url = await startCardPayment(order, `${req.protocol}://${req.get("host")}`);
    return res.json({ url });
  } catch (err: any) {
    req.log?.error({ err, orderId: order.id }, "Stripe checkout failed");
    return res.status(502).json({ error: "Could not start card payment. Please try again." });
  }
});

router.post("/orders/:id/confirm-delivery", async (req, res) => {
  const order = await ownOrder(req, Number(req.params.id));
  if (!order) return res.status(404).json({ error: "Order not found." });
  if (order.status !== "shipped") return res.status(409).json({ error: "This order hasn't been shipped yet." });
  return res.json(await applyTransition(order, "delivered", `buyer:${order.userId}`));
});

/* ── Staff console: orders ──────────────────────────────────────────────── */

router.get("/staff/orders", requirePermission("orders.view"), async (req, res) => {
  const { status, region, channel } = req.query as Record<string, string | undefined>;
  const where = [
    status ? eq(ordersTable.status, status) : undefined,
    region ? eq(ordersTable.region, region) : undefined,
    channel ? eq(ordersTable.channel, channel) : undefined,
  ].filter(Boolean) as any[];
  const orders = await db.select().from(ordersTable).where(where.length ? and(...where) : undefined)
    .orderBy(desc(ordersTable.createdAt)).limit(200);
  return res.json(await attachLineItems(orders));
});

router.post("/staff/orders/:id/status", requirePermission("orders.manage"), async (req, res) => {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, Number(req.params.id))).limit(1);
  if (!order) return res.status(404).json({ error: "Order not found." });
  const to = String(req.body?.status ?? "");
  const staff = (req as any).staff as StaffContext;
  if (to === "refunded" && !staff.permissions.has("payments.confirm")) return res.status(403).json({ error: "You can't refund orders." });
  const problem = transitionProblem(order, to);
  if (problem) return res.status(409).json({ error: problem });
  const cashCollected = req.body?.cashCollected === true;
  if (cashCollected && !(to === "delivered" && order.paymentMethod === "cod" && order.paymentStatus !== "paid")) {
    return res.status(400).json({ error: "Cash can only be recorded when a cash-on-delivery order is delivered." });
  }
  if (cashCollected && !staff.permissions.has("payments.confirm")) return res.status(403).json({ error: "You can't record payments." });
  const updated = await applyTransition(order, to as OrderStatus, staff.id);
  if (!cashCollected) return res.json(updated);
  // Delivered and the courier/rider handed over the cash: record the payment in the same step.
  const now = new Date();
  await db.insert(paymentsTable).values({
    orderId: order.id, provider: "cod", amount: order.totalAmount, currency: order.currency,
    status: "paid", recordedBy: staff.id, paidAt: now,
  });
  const [paid] = await db.update(ordersTable).set({ paymentStatus: "paid", paidAt: now, updatedAt: now })
    .where(eq(ordersTable.id, order.id)).returning();
  await recordCommissions(order.id);
  return res.json(paid);
});

/** Staff records a cash-on-delivery or bank-transfer payment. */
router.post("/staff/orders/:id/payment", requirePermission("payments.confirm"), async (req, res) => {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, Number(req.params.id))).limit(1);
  if (!order) return res.status(404).json({ error: "Order not found." });
  const method = String(req.body?.method ?? "");
  if (!["cod", "bank_transfer"].includes(method)) return res.status(400).json({ error: "Method must be cod or bank_transfer." });
  if (order.paymentStatus === "paid") return res.status(409).json({ error: "This order is already paid." });
  if (method === "cod" && order.status !== "delivered") return res.status(409).json({ error: "Cash is collected on delivery — mark the order delivered first." });
  const staff = (req as any).staff as StaffContext;
  const now = new Date();
  await db.insert(paymentsTable).values({
    orderId: order.id, provider: method, amount: order.totalAmount, currency: order.currency,
    status: "paid", recordedBy: staff.id, paidAt: now,
  });
  const [updated] = await db.update(ordersTable).set({ paymentStatus: "paid", paymentMethod: method, paidAt: now, updatedAt: now })
    .where(eq(ordersTable.id, order.id)).returning();
  await recordCommissions(order.id);
  return res.json(updated);
});

/** Staff finishes a WhatsApp order once the chat confirms it. */
router.post("/staff/orders/:id/whatsapp-confirm", requirePermission("orders.manage"), async (req, res) => {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, Number(req.params.id))).limit(1);
  if (!order || order.channel !== "whatsapp") return res.status(404).json({ error: "WhatsApp order not found." });
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const shippingAddress = str(req.body?.shippingAddress, 500);
  const shippingCity = str(req.body?.shippingCity, 100);
  const shippingCountry = str(req.body?.shippingCountry, 100);
  const contactEmail = str(req.body?.contactEmail, 200);
  // The delivery address is agreed in the chat; it must be on the order before anything is shipped.
  if (!shippingAddress || !(shippingCity || order.shippingCity)) {
    return res.status(400).json({ error: "Enter the delivery address and city agreed in the chat." });
  }
  const problem = transitionProblem({ ...order, shippingAddress }, "confirmed");
  if (problem) return res.status(409).json({ error: problem });
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return res.status(400).json({ error: "That email address doesn't look right." });
  await db.update(ordersTable).set({
    shippingAddress,
    ...(shippingCity ? { shippingCity } : {}),
    ...(shippingCountry ? { shippingCountry } : {}),
    ...(contactEmail ? { contactEmail } : {}),
  }).where(eq(ordersTable.id, order.id));
  return res.json(await applyTransition({ ...order, shippingAddress }, "confirmed", ((req as any).staff as StaffContext).id));
});

/* ── Admin ──────────────────────────────────────────────────────────────── */

router.get("/admin/orders", requireAdminSession, async (_req, res) => {
  const orders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));
  return res.json(await attachLineItems(orders));
});

router.patch("/admin/orders/:id/status", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = UpdateOrderStatusBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid status" });

  const [current] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!current) return res.status(404).json({ error: "Not found" });
  const to = parsed.data.status;
  // Same rules as the staff console: no skipping or reversing steps (that left orders
  // shipped without ever being confirmed). "paid" is the old console's status.
  const problem = to === "paid" ? null : transitionProblem(current, to);
  if (problem) return res.status(409).json({ error: problem });
  if (to === "shipped" && current.region === "international" && current.paymentStatus !== "paid") {
    return res.status(409).json({ error: "International orders must be paid before shipping." });
  }
  // The old console used "paid" as a status; it now also records the payment.
  if (to === "paid" && current.paymentStatus !== "paid") {
    await db.update(ordersTable).set({ paymentStatus: "paid", paidAt: new Date() }).where(eq(ordersTable.id, id));
    await recordCommissions(id);
  }
  const order = await applyTransition({ ...current, paymentStatus: to === "paid" ? "paid" : current.paymentStatus }, to, "admin-console");
  return res.json(order);
});

router.delete("/admin/orders/:id", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  // order_line_items has ON DELETE CASCADE (migration-01), but deleting
  // explicitly keeps this correct against a database where that migration has
  // not been applied yet.
  await db.delete(orderLineItemsTable).where(eq(orderLineItemsTable.orderId, id));
  const [order] = await db.delete(ordersTable).where(eq(ordersTable.id, id)).returning();

  if (!order) return res.status(404).json({ error: "Not found" });
  return res.json({ ok: true });
});

/* ── Helpers ────────────────────────────────────────────────────────────── */

/** Fetch line items for many orders in one query rather than one query each. */
async function attachLineItems<T extends { id: number }>(orders: T[]) {
  if (orders.length === 0) return [];

  const allLines = await db
    .select()
    .from(orderLineItemsTable)
    .where(inArray(orderLineItemsTable.orderId, orders.map((o) => o.id)));

  const byOrder = new Map<number, typeof allLines>();
  for (const line of allLines) {
    const list = byOrder.get(line.orderId) ?? [];
    list.push(line);
    byOrder.set(line.orderId, list);
  }

  return orders.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] }));
}

export default router;
