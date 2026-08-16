import { Router } from "express";
import { getAuth } from "@clerk/express";
import { createClerkClient } from "@clerk/backend";
import { db, enquiriesTable, usersTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { requireAdminSession } from "./admin-auth";

const router = Router();

const getClerkClient = () =>
  createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

async function requireCollectorAuth(req: any, res: any, next: any) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
}

async function provisionUser(userId: string) {
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const clerk = getClerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
  const firstName = clerkUser.firstName ?? "";
  const lastName = clerkUser.lastName ?? "";

  const [created] = await db
    .insert(usersTable)
    .values({ clerkUserId: userId, email, firstName, lastName, role: "collector" })
    .returning();

  return created;
}

router.post("/enquiries", requireCollectorAuth, async (req, res) => {
  const { userId } = req as any;
  const { items, message } = req.body;

  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: "No items provided" });

  const user = await provisionUser(userId);

  const [enquiry] = await db
    .insert(enquiriesTable)
    .values({
      clerkUserId: userId,
      userEmail: user.email,
      userName: `${user.firstName} ${user.lastName}`.trim() || user.email,
      items,
      message: message ?? "",
      status: "pending",
    })
    .returning();

  return res.status(201).json(enquiry);
});

router.get("/enquiries", requireAdminSession, async (_req, res) => {
  const enquiries = await db
    .select()
    .from(enquiriesTable)
    .orderBy(enquiriesTable.createdAt);
  return res.json(enquiries.reverse());
});

router.patch("/enquiries/:id/status", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!["pending", "contacted", "completed"].includes(status))
    return res.status(400).json({ error: "Invalid status" });

  const [updated] = await db
    .update(enquiriesTable)
    .set({ status })
    .where(eq(enquiriesTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

router.get("/enquiries/me", requireCollectorAuth, async (req, res) => {
  const { userId } = req as any;
  const enquiries = await db
    .select()
    .from(enquiriesTable)
    .where(eq(enquiriesTable.clerkUserId, userId))
    .orderBy(enquiriesTable.createdAt);
  return res.json(enquiries.reverse());
});

router.get("/users/me", requireCollectorAuth, async (req, res) => {
  const { userId } = req as any;
  const user = await provisionUser(userId);
  return res.json(user);
});

export default router;
