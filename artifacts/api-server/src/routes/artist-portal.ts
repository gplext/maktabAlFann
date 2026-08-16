import { Router } from "express";
import { getAuth } from "@clerk/express";
import { createClerkClient } from "@clerk/backend";
import {
  db,
  artistsTable,
  artworksTable,
  galleryCommissionTable,
  tagsTable,
  artworkTagsTable,
  artistClaimsTable,
  artistMergeRequestsTable,
  artCategoriesTable,
  artStylesTable,
  sizesTable,
  techniquesTable,
  toMoney,
  BASE_CURRENCY,
} from "@workspace/db";
import { SubmitArtworkBody, UpdateArtworkBody } from "@workspace/api-zod";
import { validateClassification, deriveDisplayPrice } from "../lib/classification";
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import { computeRiskScore } from "../lib/risk-score";
import { formatZodError } from "../lib/validation";

const router = Router();

const getClerkClient = () =>
  createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

export async function requireArtistAuth(req: any, res: any, next: any) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
}

async function syncTags(artworkId: number, tags: string[]) {
  await db
    .delete(artworkTagsTable)
    .where(eq(artworkTagsTable.artworkId, artworkId));

  for (const rawName of tags) {
    const name = rawName.trim().toLowerCase();
    if (!name) continue;
    let [tag] = await db
      .select()
      .from(tagsTable)
      .where(eq(tagsTable.name, name))
      .limit(1);
    if (!tag) {
      [tag] = await db.insert(tagsTable).values({ name }).returning();
    }
    if (tag) {
      await db
        .insert(artworkTagsTable)
        .values({ artworkId, tagId: tag.id })
        .onConflictDoNothing();
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function digitsOnly(s: string) {
  return s.replace(/\D/g, "");
}
function phonesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const da = digitsOnly(a);
  const db2 = digitsOnly(b);
  if (!da || !db2) return false;
  // Compare last 10 digits to handle country-code differences
  const len = Math.min(10, da.length, db2.length);
  return da.slice(-len) === db2.slice(-len);
}

// POST /artist-portal/verify-record — no auth required
router.post("/artist-portal/verify-record", async (req, res) => {
  const { name, email, phone } = req.body;
  const trimName = (name ?? "").trim();
  if (!trimName) return res.status(400).json({ error: "name is required" });

  // Find unclaimed artist by name (case-insensitive)
  const [artist] = await db
    .select({ id: artistsTable.id, contactEmail: artistsTable.contactEmail, phone: artistsTable.phone, phone2: artistsTable.phone2 })
    .from(artistsTable)
    .where(and(
      sql`lower(${artistsTable.name}) = lower(${trimName})`,
      sql`${artistsTable.clerkUserId} IS NULL`,
    ))
    .limit(1);

  if (!artist) return res.json({ nameMatch: false, recordFound: false, artistId: null });

  // Email OR any phone match is sufficient
  const emailMatch = !!(email && artist.contactEmail &&
    email.trim().toLowerCase() === artist.contactEmail.trim().toLowerCase());
  const phoneMatch = !!(phone && (
    (artist.phone  && phonesMatch(phone, artist.phone))  ||
    (artist.phone2 && phonesMatch(phone, artist.phone2))
  ));
  const recordFound = emailMatch || phoneMatch;

  return res.json({ nameMatch: true, recordFound, artistId: recordFound ? artist.id : null });
});

// POST /artist-portal/merge-request — no auth required
router.post("/artist-portal/merge-request", async (req, res) => {
  const { name, email, phone, message } = req.body;
  if (!name || !email || !phone || !message)
    return res.status(400).json({ error: "name, email, phone, and message are required" });

  // Find artist id if possible
  const [artist] = await db
    .select({ id: artistsTable.id })
    .from(artistsTable)
    .where(sql`lower(${artistsTable.name}) = lower(${name.trim()})`)
    .limit(1);

  const [request] = await db
    .insert(artistMergeRequestsTable)
    .values({
      artistId: artist?.id ?? null,
      submittedName: name.trim(),
      submittedEmail: email.trim(),
      submittedPhone: phone.trim(),
      message: message.trim(),
      status: "pending",
    })
    .returning();

  return res.json({ ok: true, requestId: request.id });
});

// POST /artist-portal/check-name — no auth required
router.post("/artist-portal/check-name", async (req, res) => {
  const raw = (req.body?.name ?? "") as string;
  const name = raw.trim();
  if (!name) return res.status(400).json({ error: "name is required" });

  // Case-insensitive match against unclaimed (clerk_user_id IS NULL) records only
  const [match] = await db
    .select({ id: artistsTable.id, phone: artistsTable.phone })
    .from(artistsTable)
    .where(
      and(
        sql`lower(${artistsTable.name}) = lower(${name})`,
        sql`${artistsTable.clerkUserId} IS NULL`,
      ),
    )
    .limit(1);

  if (!match) {
    // Check whether the name exists but belongs to a claimed (already has Clerk account) artist
    const [claimed] = await db
      .select({ id: artistsTable.id })
      .from(artistsTable)
      .where(
        and(
          sql`lower(${artistsTable.name}) = lower(${name})`,
          sql`${artistsTable.clerkUserId} IS NOT NULL`,
        ),
      )
      .limit(1);

    if (claimed) {
      return res.json({ match: false, alreadyClaimed: true, artistId: null, requiresPhoneVerification: false });
    }

    return res.json({ match: false, alreadyClaimed: false, artistId: null, requiresPhoneVerification: false });
  }

  // Phone verification is required when the admin pre-filled a phone number
  const requiresPhoneVerification = !!match.phone && match.phone.trim() !== "";
  return res.json({ match: true, alreadyClaimed: false, artistId: match.id, requiresPhoneVerification });
});

// POST /artist-portal/claim-request — submit a claim for an unclaimed artist record
router.post("/artist-portal/claim-request", requireArtistAuth, async (req, res) => {
  const { userId } = req as any;

  // 409 if this user already has a linked artist profile
  const [alreadyLinked] = await db
    .select({ id: artistsTable.id })
    .from(artistsTable)
    .where(eq(artistsTable.clerkUserId, userId))
    .limit(1);
  if (alreadyLinked)
    return res.status(409).json({ error: "You already have an artist profile linked to this account." });

  const { existingArtistId, phone, message } = req.body;
  if (!existingArtistId || !phone)
    return res.status(400).json({ error: "existingArtistId and phone are required" });

  const targetId = Number(existingArtistId);

  // 409 if target record already has a clerk_user_id
  const [target] = await db
    .select({ id: artistsTable.id, phone: artistsTable.phone, clerkUserId: artistsTable.clerkUserId })
    .from(artistsTable)
    .where(eq(artistsTable.id, targetId))
    .limit(1);
  if (!target)
    return res.status(404).json({ error: "Artist record not found." });
  if (target.clerkUserId)
    return res.status(409).json({ error: "This artist record has already been claimed." });

  // 409 if this user already has a pending claim for any artist
  const [pendingClaim] = await db
    .select({ id: artistClaimsTable.id })
    .from(artistClaimsTable)
    .where(
      sql`${artistClaimsTable.clerkUserId} = ${userId} AND ${artistClaimsTable.status} IN ('pending', 'auto_verified')`,
    )
    .limit(1);
  if (pendingClaim)
    return res.status(409).json({ error: "You already have a pending claim request awaiting review." });

  const matched = phonesMatch(phone, target.phone ?? "");
  const status = matched ? "auto_verified" : "pending";

  // ── Risk scoring for claim ──────────────────────────────────────────────────
  const clerk = getClerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const primaryEmail    = clerkUser.emailAddresses[0];
  const accountAgeHours = (Date.now() - clerkUser.createdAt) / (1000 * 60 * 60);
  const emailVerified   = primaryEmail?.verification?.status === "verified";
  const emailDomain     = primaryEmail?.emailAddress.split("@")[1] ?? "";
  const allArtistNames  = (await db.select({ name: artistsTable.name }).from(artistsTable))
    .map((a) => a.name.toLowerCase().trim());

  const [target2] = await db.select({ name: artistsTable.name }).from(artistsTable).where(eq(artistsTable.id, targetId)).limit(1);
  const { score, flags } = computeRiskScore({
    clerkAccountAgeHours: accountAgeHours,
    emailVerified,
    emailDomain,
    name: target2?.name ?? "",
    existingArtistNames: allArtistNames,
    photoUrl: "",   // no photo at claim time
    biography: "",  // no bio at claim time
  });

  const [claim] = await db
    .insert(artistClaimsTable)
    .values({
      artistId: targetId,
      clerkUserId: userId,
      submittedPhone: phone,
      phoneMatched: matched,
      status,
      adminNote: message ?? "",
      riskScore: score,
      riskFlags: flags,
    })
    .returning();

  return res.json({
    message: "Your request has been submitted and is awaiting review by our curators.",
    claimId: claim.id,
    status: claim.status,
  });
});

// GET /artist-portal/my-claim — most recent pending/auto_verified claim for this user
router.get("/artist-portal/my-claim", requireArtistAuth, async (req, res) => {
  const { userId } = req as any;
  const [claim] = await db
    .select()
    .from(artistClaimsTable)
    .where(
      sql`${artistClaimsTable.clerkUserId} = ${userId} AND ${artistClaimsTable.status} IN ('pending', 'auto_verified')`,
    )
    .orderBy(desc(artistClaimsTable.createdAt))
    .limit(1);
  if (!claim) return res.status(404).json({ error: "No pending claim found" });
  return res.json(claim);
});

router.get("/artist-portal/me", requireArtistAuth, async (req, res) => {
  const { userId } = req as any;
  const [artist] = await db
    .select()
    .from(artistsTable)
    .where(eq(artistsTable.clerkUserId, userId))
    .limit(1);
  if (!artist) return res.status(404).json({ error: "No artist profile linked" });
  return res.json(artist);
});

router.post("/artist-portal/register", requireArtistAuth, async (req, res) => {
  const { userId } = req as any;

  const existing = await db
    .select()
    .from(artistsTable)
    .where(eq(artistsTable.clerkUserId, userId))
    .limit(1);
  if (existing.length > 0)
    return res.status(409).json({ error: "Artist profile already exists" });

  const clerk = getClerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";

  const {
    name, country, birthYear, gender, style,
    photoUrl, shortBio, biography, influences,
    awards, exhibitions, contactEmail, websiteUrl,
    saying, sayingAuthor, phone,
  } = req.body;

  if (!name || !shortBio || !style)
    return res.status(400).json({ error: "name, shortBio, and style are required" });

  // ── Risk scoring ────────────────────────────────────────────────────────────
  const primaryEmail = clerkUser.emailAddresses[0];
  const accountAgeHours = (Date.now() - clerkUser.createdAt) / (1000 * 60 * 60);
  const emailVerified   = primaryEmail?.verification?.status === "verified";
  const emailDomain     = primaryEmail?.emailAddress.split("@")[1] ?? "";

  const allArtistNames = (await db.select({ name: artistsTable.name }).from(artistsTable))
    .map((a) => a.name.toLowerCase().trim());

  const { score, flags } = computeRiskScore({
    clerkAccountAgeHours: accountAgeHours,
    emailVerified,
    emailDomain,
    name: name ?? "",
    existingArtistNames: allArtistNames,
    photoUrl: photoUrl ?? "",
    biography: biography ?? shortBio ?? "",
  });

  const isVerified = score >= 40 ? "flagged" : "pending";

  // ── New artist path ────────────────────────────────────────────────────────
  const [artist] = await db
    .insert(artistsTable)
    .values({
      clerkUserId: userId,
      name: name ?? "",
      country: country ?? "Pakistan",
      birthYear: birthYear ? Number(birthYear) : new Date().getFullYear(),
      gender: gender ?? "",
      style: style ?? "",
      photoUrl: photoUrl ?? "",
      shortBio: shortBio ?? "",
      biography: biography ?? shortBio ?? "",
      influences: influences ?? "",
      awards: awards ?? "",
      exhibitions: exhibitions ?? "",
      contactEmail: contactEmail ?? email,
      websiteUrl: websiteUrl ?? "",
      isVerified,
      saying: saying ?? "",
      sayingAuthor: sayingAuthor ?? "",
      phone: phone ?? "",
      riskScore: score,
      riskFlags: flags,
    })
    .returning();

  return res.status(201).json(artist);
});

router.patch("/artist-portal/profile", requireArtistAuth, async (req, res) => {
  const { userId } = req as any;
  const [existing] = await db
    .select()
    .from(artistsTable)
    .where(eq(artistsTable.clerkUserId, userId))
    .limit(1);
  if (!existing) return res.status(404).json({ error: "No artist profile" });

  const updates: Partial<typeof artistsTable.$inferInsert> = {};
  const allowed = [
    "name", "country", "birthYear", "gender", "style", "photoUrl",
    "shortBio", "biography", "influences", "awards", "exhibitions",
    "contactEmail", "websiteUrl", "saying", "sayingAuthor",
  ] as const;
  for (const key of allowed) {
    if (req.body[key] !== undefined) (updates as any)[key] = req.body[key];
  }

  const [updated] = await db
    .update(artistsTable)
    .set(updates)
    .where(eq(artistsTable.clerkUserId, userId))
    .returning();
  return res.json(updated);
});

router.get("/artist-portal/artworks", requireArtistAuth, async (req, res) => {
  const { userId } = req as any;
  const artworks = await db
    .select()
    .from(artworksTable)
    .where(eq(artworksTable.submittedByClerkId, userId));

  const artworkIds = artworks.map((a) => a.id);
  const tagLinks =
    artworkIds.length > 0
      ? await db
          .select({
            artworkId: artworkTagsTable.artworkId,
            tagName: tagsTable.name,
          })
          .from(artworkTagsTable)
          .innerJoin(tagsTable, eq(artworkTagsTable.tagId, tagsTable.id))
          .where(inArray(artworkTagsTable.artworkId, artworkIds))
      : [];

  const tagsByArtwork = new Map<number, string[]>();
  for (const { artworkId, tagName } of tagLinks) {
    const arr = tagsByArtwork.get(artworkId) ?? [];
    arr.push(tagName);
    tagsByArtwork.set(artworkId, arr);
  }

  const result = artworks.map((a) => ({
    ...a,
    tags: tagsByArtwork.get(a.id) ?? [],
  }));
  return res.json(result);
});

router.post("/artist-portal/artworks", requireArtistAuth, async (req, res) => {
  const { userId } = req as any;
  const [artist] = await db
    .select()
    .from(artistsTable)
    .where(eq(artistsTable.clerkUserId, userId))
    .limit(1);
  if (!artist) return res.status(403).json({ error: "Register as an artist first" });

  const parsed = SubmitArtworkBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: formatZodError(parsed.error) });

  const {
    title, theme, year, imageUrl, shortDescription, medium, dimensions,
    tagline, widthCm, heightCm, frameIncluded, frameDescription,
    expectedPrice, tags,
    artCategoryId, artStyleId, sizeId, techniqueId, artSubcategoryId,
  } = parsed.data;

  const invalid = await validateClassification({ artCategoryId, artStyleId, sizeId, techniqueId });
  if (invalid) return res.status(400).json({ error: invalid });

  // The artist states what they expect to receive; the public price is derived
  // from it and their commission rate. A client-supplied display price is never
  // accepted.
  const expPrice = expectedPrice != null ? toMoney(expectedPrice) : null;
  const dispPrice = deriveDisplayPrice(expPrice, artist.defaultCommissionRate);

  const [artwork] = await db
    .insert(artworksTable)
    .values({
      title,
      artistId: artist.id,
      artCategoryId,
      artStyleId: artStyleId ?? null,
      sizeId: sizeId ?? null,
      techniqueId: techniqueId ?? null,
      artSubcategoryId: artSubcategoryId ?? null,
      theme: theme ?? "",
      year: year ?? new Date().getFullYear(),
      imageUrl,
      thumbnailUrl: imageUrl,
      shortDescription,
      history: "",
      styleExplanation: "",
      culturalContext: "",
      medium: medium ?? "",
      dimensions: dimensions ?? "",
      isFeatured: false,
      timeline: [],
      status: "pending",
      submittedByClerkId: userId,
      tagline: tagline ?? null,
      widthCm: widthCm ?? null,
      heightCm: heightCm ?? null,
      frameIncluded: Boolean(frameIncluded),
      frameDescription: frameIncluded ? (frameDescription ?? null) : null,
      expectedPrice: expPrice,
      displayPrice: dispPrice,
    })
    .returning();

  if (Array.isArray(tags) && tags.length > 0) {
    await syncTags(artwork.id, tags);
  }

  return res.status(201).json({ ...artwork, tags: tags ?? [] });
});

router.patch(
  "/artist-portal/artworks/:id",
  requireArtistAuth,
  async (req, res) => {
    const { userId } = req as any;
    const id = Number(req.params.id);

    const [existing] = await db
      .select()
      .from(artworksTable)
      .where(
        and(
          eq(artworksTable.id, id),
          eq(artworksTable.submittedByClerkId, userId),
        ),
      )
      .limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const parsedBody = UpdateArtworkBody.safeParse(req.body);
    if (!parsedBody.success) return res.status(400).json({ error: formatZodError(parsedBody.error) });
    const body = parsedBody.data;

    const invalid = await validateClassification(body);
    if (invalid) return res.status(400).json({ error: invalid });

    // Zod already restricts the body to known fields, so this is the allow-list.
    const allowed = [
      "title", "theme", "year", "imageUrl", "shortDescription", "medium",
      "dimensions", "tagline", "widthCm", "heightCm", "frameIncluded",
      "frameDescription", "artCategoryId", "artStyleId", "sizeId",
      "techniqueId", "artSubcategoryId",
    ] as const;
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    if (body.imageUrl) updates.thumbnailUrl = body.imageUrl;

    // Recalculate the derived public price whenever the expected price changes.
    if (body.expectedPrice !== undefined) {
      const expPrice = body.expectedPrice != null ? toMoney(body.expectedPrice) : null;
      updates.expectedPrice = expPrice;
      if (expPrice != null) {
        const [artistRow] = await db
          .select({ defaultCommissionRate: artistsTable.defaultCommissionRate })
          .from(artistsTable)
          .where(eq(artistsTable.clerkUserId, userId))
          .limit(1);
        updates.displayPrice = deriveDisplayPrice(expPrice, artistRow?.defaultCommissionRate);
      } else {
        updates.displayPrice = null;
      }
    }

    const [updated] = await db
      .update(artworksTable)
      .set({ ...updates, status: "pending" })
      .where(eq(artworksTable.id, id))
      .returning();

    if (Array.isArray(body.tags)) {
      await syncTags(id, body.tags);
    }

    return res.json({
      ...updated,
      tags: Array.isArray(body.tags) ? body.tags : [],
    });
  },
);

router.delete(
  "/artist-portal/artworks/:id",
  requireArtistAuth,
  async (req, res) => {
    const { userId } = req as any;
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(artworksTable)
      .where(
        and(
          eq(artworksTable.id, id),
          eq(artworksTable.submittedByClerkId, userId),
        ),
      )
      .limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    await db.delete(artworkTagsTable).where(eq(artworkTagsTable.artworkId, id));
    await db.delete(artworksTable).where(eq(artworksTable.id, id));
    return res.json({ ok: true });
  },
);

router.get("/artist-portal/earnings", requireArtistAuth, async (req, res) => {
  const { userId } = req as any;
  const [artist] = await db
    .select({ id: artistsTable.id, defaultCommissionRate: artistsTable.defaultCommissionRate })
    .from(artistsTable)
    .where(eq(artistsTable.clerkUserId, userId))
    .limit(1);
  if (!artist) return res.status(404).json({ error: "No artist profile" });

  const artworks = await db
    .select({ id: artworksTable.id, status: artworksTable.status })
    .from(artworksTable)
    .where(eq(artworksTable.artistId, artist.id));

  const total = artworks.length;
  const published = artworks.filter((a) => a.status === "approved").length;
  const pending = artworks.filter((a) => a.status === "pending").length;
  const rejected = artworks.filter((a) => a.status === "rejected").length;

  let enquiryCount = 0;
  if (artworks.length > 0) {
    const artworkIds = artworks.map((a) => a.id);
    // Pass ids as a PG array literal so ANY() receives a single array param, not a row constructor
    const pgArray = `{${artworkIds.join(",")}}`;
    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT e.id)::int AS count
      FROM enquiries e,
      jsonb_array_elements(e.items) AS item
      WHERE (item->>'artworkId')::int = ANY(${pgArray}::int[])
    `);
    enquiryCount = Number((result.rows[0] as any)?.count ?? 0);
  }

  const [commRow] = await db
    .select({
      purchaseCount: sql<number>`count(*)::int`,
      totalEarning: sql<number>`coalesce(sum(artist_earning), 0)::int`,
      totalSalePrice: sql<number>`coalesce(sum(sale_price), 0)::int`,
      totalCommission: sql<number>`coalesce(sum(commission_amount), 0)::int`,
    })
    .from(galleryCommissionTable)
    .where(eq(galleryCommissionTable.artistId, artist.id));

  const commissions = await db
    .select()
    .from(galleryCommissionTable)
    .where(eq(galleryCommissionTable.artistId, artist.id))
    .orderBy(sql`created_at desc`);

  return res.json({
    total,
    published,
    pending,
    rejected,
    enquiryCount,
    purchaseCount: commRow?.purchaseCount ?? 0,
    totalEarning: commRow?.totalEarning ?? 0,
    totalSalePrice: commRow?.totalSalePrice ?? 0,
    totalCommission: commRow?.totalCommission ?? 0,
    currency: BASE_CURRENCY,
    defaultCommissionRate: artist.defaultCommissionRate,
    commissions,
  });
});

export default router;
