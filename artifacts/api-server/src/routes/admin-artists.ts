import { Router } from "express";
import { createClerkClient } from "@clerk/backend";
import { db, artistsTable, artistClaimsTable, artistMergeRequestsTable, portfolioTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAdminSession } from "./admin-auth";

const getClerkClient = () =>
  createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

const router = Router();

router.get("/admin/artists", requireAdminSession, async (req, res) => {
  const artists = await db.select().from(artistsTable).orderBy(artistsTable.name);
  return res.json(artists);
});

router.post("/admin/artists", requireAdminSession, async (req, res) => {
  const {
    name, country, birthYear, gender, style, photoUrl,
    shortBio, biography, influences, awards, exhibitions, contactEmail, websiteUrl,
    phone, phone2,
  } = req.body;
  if (!name || !style || !shortBio)
    return res.status(400).json({ error: "name, style, and shortBio are required" });

  const [artist] = await db.insert(artistsTable).values({
    name,
    country: country || "Pakistan",
    birthYear: birthYear ? Number(birthYear) : new Date().getFullYear(),
    gender: gender || "",
    style,
    photoUrl: photoUrl || "",
    shortBio,
    biography: biography || shortBio,
    influences: influences || "",
    awards: awards || "",
    exhibitions: exhibitions || "",
    contactEmail: contactEmail || "",
    websiteUrl: websiteUrl || "",
    phone: phone || "",
    phone2: phone2 || "",
    isVerified: "verified",
    portfolioDisabled: false,
  }).returning();

  return res.status(201).json(artist);
});

router.patch("/admin/artists/:id", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const allowed = [
    "name", "country", "birthYear", "gender", "style", "photoUrl",
    "shortBio", "biography", "influences", "awards", "exhibitions",
    "contactEmail", "websiteUrl", "isVerified", "portfolioDisabled",
    "defaultCommissionRate", "phone", "phone2",
  ] as const;
  const updates: any = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const [updated] = await db
    .update(artistsTable)
    .set(updates)
    .where(eq(artistsTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Artist not found" });
  return res.json(updated);
});

router.delete("/admin/artists/:id", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  // Null-out the artistId FK on merge requests (they are kept for record-keeping)
  await db
    .update(artistMergeRequestsTable)
    .set({ artistId: null })
    .where(eq(artistMergeRequestsTable.artistId, id));

  // Hard-delete artist claims and portfolio rows that reference this artist
  await db.delete(artistClaimsTable).where(eq(artistClaimsTable.artistId, id));
  await db.delete(portfolioTable).where(eq(portfolioTable.artistId, id));

  // Now safe to delete the artist
  await db.delete(artistsTable).where(eq(artistsTable.id, id));
  return res.json({ ok: true });
});

// ── Artist Claim Routes ───────────────────────────────────────────────────────

router.get("/admin/artist-claims", requireAdminSession, async (req, res) => {
  const claims = await db
    .select({
      id:             artistClaimsTable.id,
      artistId:       artistClaimsTable.artistId,
      clerkUserId:    artistClaimsTable.clerkUserId,
      submittedPhone: artistClaimsTable.submittedPhone,
      phoneMatched:   artistClaimsTable.phoneMatched,
      status:         artistClaimsTable.status,
      adminNote:      artistClaimsTable.adminNote,
      createdAt:      artistClaimsTable.createdAt,
      artistName:     artistsTable.name,
      storedPhone:    artistsTable.phone,
    })
    .from(artistClaimsTable)
    .leftJoin(artistsTable, eq(artistClaimsTable.artistId, artistsTable.id))
    .orderBy(desc(artistClaimsTable.createdAt));

  const clerk = getClerkClient();
  const enriched = await Promise.all(
    claims.map(async (c) => {
      let requesterEmail = "";
      try {
        const user = await clerk.users.getUser(c.clerkUserId);
        requesterEmail = user.emailAddresses[0]?.emailAddress ?? "";
      } catch {
        // ignore — user may have been deleted
      }
      return { ...c, requesterEmail };
    }),
  );

  return res.json(enriched);
});

router.post("/admin/artist-claims/:id/approve", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [claim] = await db
    .select()
    .from(artistClaimsTable)
    .where(eq(artistClaimsTable.id, id))
    .limit(1);
  if (!claim) return res.status(404).json({ error: "Claim not found" });

  // Link the Clerk account to the artist record
  await db
    .update(artistsTable)
    .set({ clerkUserId: claim.clerkUserId, isVerified: "approved" })
    .where(eq(artistsTable.id, claim.artistId));

  const [updated] = await db
    .update(artistClaimsTable)
    .set({ status: "approved" })
    .where(eq(artistClaimsTable.id, id))
    .returning();

  return res.json(updated);
});

router.post("/admin/artist-claims/:id/reject", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: "reason is required" });

  const [updated] = await db
    .update(artistClaimsTable)
    .set({ status: "rejected", adminNote: reason })
    .where(eq(artistClaimsTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Claim not found" });
  return res.json(updated);
});

// ── Merge Requests ────────────────────────────────────────────────────────────

router.get("/admin/merge-requests", requireAdminSession, async (_req, res) => {
  const rows = await db
    .select({
      id:             artistMergeRequestsTable.id,
      artistId:       artistMergeRequestsTable.artistId,
      submittedName:  artistMergeRequestsTable.submittedName,
      submittedEmail: artistMergeRequestsTable.submittedEmail,
      submittedPhone: artistMergeRequestsTable.submittedPhone,
      message:        artistMergeRequestsTable.message,
      status:         artistMergeRequestsTable.status,
      createdAt:      artistMergeRequestsTable.createdAt,
      matchedArtistName: artistsTable.name,
    })
    .from(artistMergeRequestsTable)
    .leftJoin(artistsTable, eq(artistsTable.id, artistMergeRequestsTable.artistId))
    .orderBy(desc(artistMergeRequestsTable.createdAt));
  return res.json(rows);
});

router.delete("/admin/merge-requests/:id", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(artistMergeRequestsTable).where(eq(artistMergeRequestsTable.id, id));
  return res.json({ ok: true });
});

router.patch("/admin/merge-requests/:id", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { status } = req.body;
  if (!["contacted", "completed", "rejected"].includes(status))
    return res.status(400).json({ error: "status must be contacted | completed | rejected" });

  const [updated] = await db
    .update(artistMergeRequestsTable)
    .set({ status })
    .where(eq(artistMergeRequestsTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// ── Set artist login password (creates Clerk account + links to artist record) ─

router.post("/admin/merge-requests/:id/set-password", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { password } = req.body;
  if (!password || String(password).length < 8)
    return res.status(400).json({ error: "Password must be at least 8 characters" });

  // Load the merge request
  const [mr] = await db
    .select()
    .from(artistMergeRequestsTable)
    .where(eq(artistMergeRequestsTable.id, id))
    .limit(1);
  if (!mr) return res.status(404).json({ error: "Merge request not found" });
  if (!mr.submittedEmail)
    return res.status(400).json({ error: "No email address on this merge request" });

  const clerk = getClerkClient();

  // Create the Clerk user; if the email already exists, find that user and
  // update their password instead (handles cases where admin deleted + re-added).
  let clerkUserId: string;
  try {
    const user = await clerk.users.createUser({
      emailAddress: [mr.submittedEmail],
      password: String(password),
    });
    clerkUserId = user.id;
  } catch (createErr: any) {
    const errCode: string = createErr?.errors?.[0]?.code ?? "";
    const isAlreadyExists =
      errCode.includes("exists") || errCode.includes("taken") ||
      createErr?.status === 422;

    if (!isAlreadyExists) {
      const msg: string =
        createErr?.errors?.[0]?.message ?? createErr?.message ?? "Could not create Clerk account";
      return res.status(400).json({ error: msg });
    }

    // Email already in Clerk — find the user and reset their password
    try {
      const list = await clerk.users.getUserList({ emailAddress: [mr.submittedEmail] });
      const existing = list.data?.[0];
      if (!existing) {
        return res.status(400).json({ error: "Email already exists in Clerk but the account could not be found. Please delete it from the Clerk dashboard and retry." });
      }
      await clerk.users.updateUser(existing.id, { password: String(password) });
      clerkUserId = existing.id;
    } catch (updateErr: any) {
      const msg: string =
        updateErr?.errors?.[0]?.message ?? updateErr?.message ?? "Could not update existing Clerk account";
      return res.status(400).json({ error: msg });
    }
  }

  // Link the Clerk account to the artist record if one is matched
  if (mr.artistId) {
    await db
      .update(artistsTable)
      .set({ clerkUserId, isVerified: "approved" })
      .where(eq(artistsTable.id, mr.artistId));
  }

  // Mark the request completed
  const [updated] = await db
    .update(artistMergeRequestsTable)
    .set({ status: "completed" })
    .where(eq(artistMergeRequestsTable.id, id))
    .returning();

  return res.json({ ok: true, clerkUserId, mergeRequest: updated });
});

export default router;
