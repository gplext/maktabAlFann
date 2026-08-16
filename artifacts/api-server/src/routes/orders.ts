import { Router } from "express";
import { eq, desc, and, isNull, inArray } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  db,
  ordersTable,
  orderLineItemsTable,
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

const router = Router();

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
router.post("/orders", async (req, res) => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) });
  }

  const { sessionId, contactName, contactPhone, contactEmail, items } = parsed.data;

  // Identity comes from the Clerk session, never from the request body — an
  // attacker must not be able to file an order against someone else's account.
  // Guests order anonymously; GET /orders links the order to their account the
  // first time they sign in from the same browser session.
  const { userId } = getAuth(req);
  const clerkUserId = userId ?? null;

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
  }[] = [];

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
      lines.push({
        artworkId: null,
        shopItemId: shopItem.id,
        title: shopItem.name,
        imageUrl: shopItem.imageUrl,
        unitPrice: shopItem.price,
        quantity: item.quantity,
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
  const order = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(ordersTable)
      .values({
        sessionId,
        clerkUserId,
        totalAmount,
        currency: BASE_CURRENCY,
        status: "pending_purchase",
        contactName: contactName ?? null,
        contactPhone: contactPhone ?? null,
        contactEmail: contactEmail ?? null,
      })
      .returning();

    await tx.insert(orderLineItemsTable).values(
      lines.map((l) => ({ ...l, orderId: created!.id })),
    );

    return created!;
  });

  const savedLines = await db
    .select()
    .from(orderLineItemsTable)
    .where(eq(orderLineItemsTable.orderId, order.id));

  req.log?.info(
    { orderId: order.id, totalAmount, lineCount: savedLines.length },
    "Order created",
  );

  return res.status(201).json({ ...order, items: savedLines });
});

/* ── Read orders for a session or Clerk user ─────────────────────────────── */

router.get("/orders", async (req, res) => {
  const parsed = ListOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "sessionId or clerkUserId required" });
  }
  const { sessionId } = parsed.data;

  // A caller may only read their OWN orders. The signed-in user's id comes from
  // the Clerk session; a clerkUserId in the query string is honoured only when
  // it matches, so nobody can list another collector's order history.
  const { userId } = getAuth(req);
  const clerkUserId = userId ?? null;

  if (parsed.data.clerkUserId && parsed.data.clerkUserId !== clerkUserId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!clerkUserId && !sessionId) {
    return res.status(400).json({ error: "sessionId or clerkUserId required" });
  }

  // When a signed-in user fetches their orders, claim any anonymous orders from
  // this browser session. This is how a guest checkout becomes part of their
  // account once they sign in.
  if (clerkUserId && sessionId) {
    await db
      .update(ordersTable)
      .set({ clerkUserId })
      .where(and(eq(ordersTable.sessionId, sessionId), isNull(ordersTable.clerkUserId)));
  }

  const orders = clerkUserId
    ? await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.clerkUserId, clerkUserId))
        .orderBy(desc(ordersTable.createdAt))
    // Guest: only unclaimed orders, so orders already claimed by an account
    // never leak through on a shared browser.
    : await db
        .select()
        .from(ordersTable)
        .where(and(eq(ordersTable.sessionId, sessionId!), isNull(ordersTable.clerkUserId)))
        .orderBy(desc(ordersTable.createdAt));

  return res.json(await attachLineItems(orders));
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

  const [order] = await db
    .update(ordersTable)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(ordersTable.id, id))
    .returning();

  if (!order) return res.status(404).json({ error: "Not found" });
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
