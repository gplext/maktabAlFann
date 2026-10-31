import { Router, type IRouter } from "express";
import { getIdentity, revokeSessions } from "../lib/auth";
import { blindIndex, decrypt, encrypt, hashPassword } from "../lib/crypto";
import { createAccount, findByIdentifier, parseIdentifier, passwordProblem } from "./auth";
import { authAccountsTable, authEventsTable, galleriesTable, ordersTable, enquiriesTable, usersTable } from "@workspace/db";
import {
  db, artistsTable, artistClaimsTable, artistMergeRequestsTable, portfolioTable, artworksTable, galleryArtistsTable,
  galleryArtworksTable, galleryCommissionTable, cartItemsTable, artworkTagsTable, suppliersTable, orderLineItemsTable,
} from "@workspace/db";
import { and, eq, desc, inArray, ne, or, sql } from "drizzle-orm";
import { requireAdminSession } from "./admin-auth";
import { requirePermission } from "../lib/permissions";
import { closeEntityTasks } from "../lib/tasks";
import { logger } from "../lib/logger";


const router: IRouter = Router();

// ── Sign-in accounts of artists / galleries: see who is linked, set a new password ──────────
const STAFF_LEVELS = ["admin", "manager", "curator", "assistant", "coordinator", "handler"];
type Acct = typeof authAccountsTable.$inferSelect;
const accountView = (a: Acct) => ({
  id: a.id, role: a.role, status: a.status, fullName: decrypt(a.fullNameEnc), email: decrypt(a.emailEnc), phone: decrypt(a.phoneEnc),
  lastLoginAt: a.lastLoginAt, locked: Boolean(a.lockedUntil && a.lockedUntil.getTime() > Date.now()),
});
const actorOf = (req: any): string => req.session?.userId ?? "env-admin";

async function linkedAccount(kind: "artist" | "gallery", id: number): Promise<Acct | null> {
  const owner = kind === "artist"
    ? (await db.select({ uid: artistsTable.clerkUserId }).from(artistsTable).where(eq(artistsTable.id, id)).limit(1))[0]?.uid
    : (await db.select({ uid: galleriesTable.clerkUserId }).from(galleriesTable).where(eq(galleriesTable.id, id)).limit(1))[0]?.uid;
  if (!owner) return null;
  const [a] = await db.select().from(authAccountsTable).where(eq(authAccountsTable.id, owner)).limit(1);
  return a ?? null;
}

/** Record details used to find the matching account: the artist's/gallery's own email and phones. */
async function recordInfo(kind: "artist" | "gallery", id: number) {
  if (kind === "artist") {
    const [a] = await db.select().from(artistsTable).where(eq(artistsTable.id, id)).limit(1);
    return a ? { name: a.name, linkedId: a.clerkUserId, contacts: [a.contactEmail, a.phone, a.phone2] } : null;
  }
  const [g] = await db.select().from(galleriesTable).where(eq(galleriesTable.id, id)).limit(1);
  return g ? { name: g.name, linkedId: g.clerkUserId, contacts: [g.email, g.phone] } : null;
}

/** First account whose sign-in email/phone equals one of the record's contact details. */
/** The account type each record should be linked to automatically. */
const ROLE_FOR = { artist: "artist", gallery: "gallery_owner" } as const;

async function suggestFor(contacts: (string | null)[], role: string): Promise<Acct | null> {
  for (const c of contacts) {
    const ident = c ? parseIdentifier(c) : null;
    const a = ident ? await findByIdentifier(ident) : null;
    // Only an account of the right type: an artist is never auto-linked to a gallery-owner login, or the reverse.
    if (a && a.role === role) return a;
  }
  return null;
}

/** Who already uses this account (an account can belong to one artist and one gallery). */
async function linkedElsewhere(kind: "artist" | "gallery", accountId: string, exceptId: number) {
  if (kind === "artist") {
    const [a] = await db.select({ name: artistsTable.name }).from(artistsTable).where(and(eq(artistsTable.clerkUserId, accountId), ne(artistsTable.id, exceptId))).limit(1);
    return a?.name ?? null;
  }
  const [g] = await db.select({ name: galleriesTable.name }).from(galleriesTable).where(and(eq(galleriesTable.clerkUserId, accountId), ne(galleriesTable.id, exceptId))).limit(1);
  return g?.name ?? null;
}

async function accountInfo(kind: "artist" | "gallery", id: number) {
  const rec = await recordInfo(kind, id);
  if (!rec) return null;
  const account = rec.linkedId
    ? (await db.select().from(authAccountsTable).where(eq(authAccountsTable.id, rec.linkedId)).limit(1))[0] ?? null
    : null;
  // A link that points nowhere is an old login from before the sign-in change (Clerk ids start with "user_").
  const staleLink = Boolean(rec.linkedId && !account && !rec.linkedId.startsWith("unlinked_"));
  if (!account) {
    // Contact email/phone matches an account: link it right away, no button needed.
    const match = await suggestFor(rec.contacts, ROLE_FOR[kind]);
    if (match && !STAFF_LEVELS.includes(match.role) && !(await linkedElsewhere(kind, match.id, id))) {
      if (kind === "artist") await db.update(artistsTable).set({ clerkUserId: match.id }).where(eq(artistsTable.id, id));
      else await db.update(galleriesTable).set({ clerkUserId: match.id }).where(eq(galleriesTable.id, id));
      return { account: accountView(match), staleLink: false, suggestion: null, autoLinked: true };
    }
  }
  return { account: account ? accountView(account) : null, staleLink, suggestion: null, autoLinked: false };
}

router.get("/admin/artists/:id/account", requireAdminSession, async (req, res) => {
  const info = await accountInfo("artist", Number(req.params.id));
  return info ? res.json(info) : res.status(404).json({ error: "Artist not found" });
});
router.get("/admin/galleries/:id/account", requireAdminSession, async (req, res) => {
  const info = await accountInfo("gallery", Number(req.params.id));
  return info ? res.json(info) : res.status(404).json({ error: "Gallery not found" });
});

/**
 * Link a sign-in account to an artist/gallery: an existing account (by email/phone), or a new one
 * created here with a password. Body: { identifier, password? , create?: boolean }.
 */
async function linkHandler(kind: "artist" | "gallery", req: any, res: any) {
  const id = Number(req.params.id);
  const rec = await recordInfo(kind, id);
  if (!rec) return res.status(404).json({ error: `${kind === "artist" ? "Artist" : "Gallery"} not found` });
  const ident = parseIdentifier(req.body?.identifier);
  if (!ident) return res.status(400).json({ error: "Enter a valid email or phone number." });
  let account = (await findByIdentifier(ident)) ?? null;
  if (req.body?.create) {
    if (account) return res.status(409).json({ error: "An account with that email/phone already exists — link it instead." });
    const pwErr = passwordProblem(req.body?.password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    const made = await createAccount(kind === "artist" ? "artist" : "gallery_owner", rec.name, ident, req.body.password);
    if (made === "exists") return res.status(409).json({ error: "An account with that email/phone already exists — link it instead." });
    account = made;
  }
  if (!account) return res.status(404).json({ error: "No account with that email or phone. Create one instead." });
  if (STAFF_LEVELS.includes(account.role)) return res.status(400).json({ error: "That is a staff account — use the artist's or gallery's own login." });
  const other = await linkedElsewhere(kind, account.id, id);
  if (other) return res.status(409).json({ error: `That account is already linked to ${kind === "artist" ? "artist" : "gallery"} “${other}”.` });
  if (kind === "artist") await db.update(artistsTable).set({ clerkUserId: account.id }).where(eq(artistsTable.id, id));
  else await db.update(galleriesTable).set({ clerkUserId: account.id }).where(eq(galleriesTable.id, id));
  await db.insert(authEventsTable).values({ accountId: account.id, event: `linked_to_${kind}_by:${actorOf(req)}`, ip: req.ip ?? null });
  return res.json({ ok: true, account: accountView(account), created: Boolean(req.body?.create) });
}
router.post("/admin/artists/:id/link", requireAdminSession, (req, res) => linkHandler("artist", req, res));
router.post("/admin/galleries/:id/link", requireAdminSession, (req, res) => linkHandler("gallery", req, res));

/** Remove the link between an artist/gallery and its sign-in account (the account itself is kept). */
async function unlinkHandler(kind: "artist" | "gallery", req: any, res: any) {
  const id = Number(req.params.id);
  const rec = await recordInfo(kind, id);
  if (!rec) return res.status(404).json({ error: "Not found" });
  if (kind === "artist") await db.update(artistsTable).set({ clerkUserId: null }).where(eq(artistsTable.id, id));
  // A gallery must always hold a value here (unique, not null): park it on a placeholder.
  else await db.update(galleriesTable).set({ clerkUserId: `unlinked_${id}` }).where(eq(galleriesTable.id, id));
  if (rec.linkedId) await db.insert(authEventsTable).values({ accountId: rec.linkedId, event: `unlinked_from_${kind}_by:${actorOf(req)}`, ip: req.ip ?? null });
  return res.json({ ok: true });
}
router.post("/admin/artists/:id/unlink", requireAdminSession, (req, res) => unlinkHandler("artist", req, res));
router.post("/admin/galleries/:id/unlink", requireAdminSession, (req, res) => unlinkHandler("gallery", req, res));

/** Correct the email or phone an account signs in with. */
router.post("/admin/accounts/:id/identifier", requireAdminSession, async (req, res) => {
  const accountId = String(req.params.id);
  const [a] = await db.select().from(authAccountsTable).where(eq(authAccountsTable.id, accountId)).limit(1);
  if (!a) return res.status(404).json({ error: "Account not found." });
  if (a.role === "admin" && actorOf(req) !== "env-admin") return res.status(403).json({ error: "Only the main admin can change an admin's sign-in." });
  const ident = parseIdentifier(req.body?.identifier);
  if (!ident) return res.status(400).json({ error: "Enter a valid email or phone number." });
  const other = await findByIdentifier(ident);
  if (other && other.id !== a.id) return res.status(409).json({ error: "Another account already signs in with that email/phone." });
  const set = ident.kind === "email"
    ? { emailEnc: encrypt(ident.value), emailHash: blindIndex(ident.value), emailVerifiedAt: new Date() }
    : { phoneEnc: encrypt(ident.value), phoneHash: blindIndex(ident.value), phoneVerifiedAt: new Date() };
  const [updated] = await db.update(authAccountsTable).set({ ...set, updatedAt: new Date() }).where(eq(authAccountsTable.id, a.id)).returning();
  await db.insert(authEventsTable).values({ accountId: a.id, event: `sign_in_changed_by:${actorOf(req)}`, ip: req.ip ?? null });
  return res.json({ ok: true, account: accountView(updated!) });
});

/**
 * Links every artist/gallery whose login is missing (or an old pre-change login) to the account that
 * signs in with the same email/phone as the record's contact details. Runs on API start and on demand.
 */
export async function autoLinkAccounts() {
  const result = { artists: 0, galleries: 0, unmatchedArtists: 0, unmatchedGalleries: 0 };
  const accountIds = new Set((await db.select({ id: authAccountsTable.id }).from(authAccountsTable)).map((a) => a.id));
  for (const a of await db.select().from(artistsTable)) {
    if (a.clerkUserId && accountIds.has(a.clerkUserId)) continue;
    const s = await suggestFor([a.contactEmail, a.phone, a.phone2], ROLE_FOR.artist);
    if (s && !STAFF_LEVELS.includes(s.role) && !(await linkedElsewhere("artist", s.id, a.id))) {
      await db.update(artistsTable).set({ clerkUserId: s.id }).where(eq(artistsTable.id, a.id)); result.artists++;
    } else result.unmatchedArtists++;
  }
  for (const g of await db.select().from(galleriesTable)) {
    if (accountIds.has(g.clerkUserId)) continue;
    const s = await suggestFor([g.email, g.phone], ROLE_FOR.gallery);
    if (s && !STAFF_LEVELS.includes(s.role) && !(await linkedElsewhere("gallery", s.id, g.id))) {
      await db.update(galleriesTable).set({ clerkUserId: s.id }).where(eq(galleriesTable.id, g.id)); result.galleries++;
    } else result.unmatchedGalleries++;
  }
  return result;
}

router.post("/admin/accounts/auto-link", requireAdminSession, async (_req, res) => res.json(await autoLinkAccounts()));

// Link everyone automatically shortly after the API starts.
setTimeout(() => {
  autoLinkAccounts()
    .then((r) => { if (r.artists || r.galleries) logger.info(r, "Accounts auto-linked by email/phone"); })
    .catch((err) => logger.warn({ err }, "Account auto-link failed"));
}, 5_000).unref();


/**
 * Admin sets a new password for an account — chosen by artist, gallery, or email/phone.
 * Unlocks it and signs that person out everywhere. Admin-level accounts can only be reset by the main (.env) admin.
 */
router.post("/admin/accounts/password", requireAdminSession, async (req, res) => {
  const { artistId, galleryId, accountId, identifier, password } = req.body ?? {};
  const pwErr = passwordProblem(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  let target: Acct | null = null;
  if (accountId) target = (await db.select().from(authAccountsTable).where(eq(authAccountsTable.id, String(accountId))).limit(1))[0] ?? null;
  else if (artistId) target = await linkedAccount("artist", Number(artistId));
  else if (galleryId) target = await linkedAccount("gallery", Number(galleryId));
  else {
    const id = parseIdentifier(identifier);
    if (!id) return res.status(400).json({ error: "Enter a valid email or phone number." });
    target = (await findByIdentifier(id)) ?? null;
  }
  if (!target) return res.status(404).json({ error: artistId || galleryId ? "No sign-in account is linked to this record." : "No account with that email or phone." });
  const actor = actorOf(req);
  if (target.id === actor) return res.status(403).json({ error: "Change your own password from your account page." });
  if (target.role === "admin" && actor !== "env-admin") return res.status(403).json({ error: "Only the main admin can reset another admin's password." });
  await db.update(authAccountsTable).set({
    passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null, updatedAt: new Date(),
  }).where(eq(authAccountsTable.id, target.id));
  await revokeSessions(target.id);
  await db.insert(authEventsTable).values({ accountId: target.id, event: `password_set_by:${actor}`, ip: req.ip ?? null });
  return res.json({ ok: true, account: accountView(target), staff: STAFF_LEVELS.includes(target.role) });
});

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
    // "approved" is the status the public site shows (an old "verified" value hid admin-added artists).
    isVerified: "approved",
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

/**
 * Removes a sign-in account so its email/phone and password are gone and can be used again.
 * Also removes data tied to it (enquiries, claims, merge requests with its email/phone, sessions).
 * Kept (and reported) when it is a staff account, still owns another artist/gallery, or has buyer orders.
 */
type EraseResult = { erased: boolean; reason?: string; login?: string | null };
async function eraseAccount(accountId: string | null | undefined): Promise<EraseResult> {
  if (!accountId) return { erased: false, reason: "No sign-in account was linked." };
  const [a] = await db.select().from(authAccountsTable).where(eq(authAccountsTable.id, accountId)).limit(1);
  if (!a) return { erased: false, reason: "No sign-in account was linked." };
  const login = decrypt(a.emailEnc) ?? decrypt(a.phoneEnc);
  if (STAFF_LEVELS.includes(a.role)) return { erased: false, login, reason: "It is a staff account, so it was kept." };
  const [art] = await db.select({ name: artistsTable.name }).from(artistsTable).where(eq(artistsTable.clerkUserId, a.id)).limit(1);
  const [gal] = await db.select({ name: galleriesTable.name }).from(galleriesTable).where(eq(galleriesTable.clerkUserId, a.id)).limit(1);
  if (art || gal) return { erased: false, login, reason: `It still owns ${art ? `artist “${art.name}”` : `gallery “${gal!.name}”`}, so it was kept.` };
  const [{ n: orders }] = await db.select({ n: sql<number>`count(*)::int` }).from(ordersTable).where(eq(ordersTable.clerkUserId, a.id));
  if (orders) return { erased: false, login, reason: `It has ${orders} order(s) as a buyer, so it was kept for the order records.` };

  const email = decrypt(a.emailEnc), phone = decrypt(a.phoneEnc);
  await revokeSessions(a.id);
  await db.transaction(async (tx) => {
    await tx.delete(enquiriesTable).where(eq(enquiriesTable.clerkUserId, a.id));
    await tx.delete(usersTable).where(eq(usersTable.clerkUserId, a.id));
    await tx.delete(artistClaimsTable).where(eq(artistClaimsTable.clerkUserId, a.id));
    const mine = [email ? eq(artistMergeRequestsTable.submittedEmail, email) : null, phone ? eq(artistMergeRequestsTable.submittedPhone, phone) : null].filter(Boolean);
    if (mine.length) await tx.delete(artistMergeRequestsTable).where(or(...(mine as any[])));
    // Codes, staff titles and saved museum layouts go with it (ON DELETE CASCADE).
    await tx.delete(authAccountsTable).where(eq(authAccountsTable.id, a.id));
  });
  return { erased: true, login };
}

// Deletes the artist AND every artwork of theirs. Nothing is moved to another artist.
router.delete("/admin/artists/:id", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [artist] = await db.select().from(artistsTable).where(eq(artistsTable.id, id)).limit(1);
  if (!artist) return res.status(404).json({ error: "Artist not found" });
  const works = await db.select({ id: artworksTable.id }).from(artworksTable).where(eq(artworksTable.artistId, id));
  const ids = works.map((w) => w.id);

  // Sold work is part of customer orders and sales records — deleting it would break that history.
  if (ids.length) {
    const [{ n: inOrders }] = await db.select({ n: sql<number>`count(*)::int` }).from(orderLineItemsTable).where(inArray(orderLineItemsTable.artworkId, ids));
    const [{ n: sales }] = await db.select({ n: sql<number>`count(*)::int` }).from(galleryCommissionTable)
      .where(sql`${galleryCommissionTable.artistId} = ${id} or ${inArray(galleryCommissionTable.artworkId, ids)}`);
    if (inOrders || sales) {
      return res.status(409).json({
        error: `Can't delete: ${artist.name}'s artworks appear in ${inOrders} customer order line(s) and ${sales} sales record(s). Set the artist to Rejected instead to hide them from the site.`,
      });
    }
  }

  await db.transaction(async (tx) => {
    if (ids.length) {
      await tx.delete(cartItemsTable).where(inArray(cartItemsTable.artworkId, ids));
      await tx.delete(artworkTagsTable).where(inArray(artworkTagsTable.artworkId, ids));
      await tx.delete(suppliersTable).where(inArray(suppliersTable.artworkId, ids));
      await tx.delete(galleryArtworksTable).where(inArray(galleryArtworksTable.artworkId, ids));
      await tx.delete(artworksTable).where(inArray(artworksTable.id, ids));
    }
    await tx.delete(galleryCommissionTable).where(eq(galleryCommissionTable.artistId, id));
    await tx.delete(galleryArtistsTable).where(eq(galleryArtistsTable.artistId, id));
    await tx.delete(artistMergeRequestsTable).where(eq(artistMergeRequestsTable.artistId, id));
    await tx.delete(artistClaimsTable).where(eq(artistClaimsTable.artistId, id));
    await tx.delete(portfolioTable).where(eq(portfolioTable.artistId, id));
    await tx.delete(artistsTable).where(eq(artistsTable.id, id));
  });
  const account = await eraseAccount(artist.clerkUserId);
  for (const aid of ids) await closeEntityTasks("artwork", aid, "artwork deleted with its artist");
  await closeEntityTasks("artist", id, "artist deleted");
  await db.insert(authEventsTable).values({ accountId: artist.clerkUserId, event: `artist_deleted_by:${actorOf(req)}`, ip: req.ip ?? null });
  return res.json({ ok: true, deletedArtworks: ids.length, account });
});



// ── Artist Claim Routes ───────────────────────────────────────────────────────

router.get("/admin/artist-claims", requirePermission("artists.approve"), async (req, res) => {
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

  const enriched = await Promise.all(
    claims.map(async (c) => {
      let requesterEmail = "";
      try {
        const who = await getIdentity(c.clerkUserId);
        requesterEmail = who.email || who.phone;
      } catch {
        // ignore — user may have been deleted
      }
      return { ...c, requesterEmail };
    }),
  );

  return res.json(enriched);
});

router.post("/admin/artist-claims/:id/approve", requirePermission("artists.approve"), async (req, res) => {
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
  await closeEntityTasks("claim", id, "claim approved", (req as any).staff?.id);

  return res.json(updated);
});

router.post("/admin/artist-claims/:id/reject", requirePermission("artists.approve"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: "reason is required" });

  const [updated] = await db
    .update(artistClaimsTable)
    .set({ status: "rejected", adminNote: reason })
    .where(eq(artistClaimsTable.id, id))
    .returning();
  if (updated) await closeEntityTasks("claim", id, `claim rejected — ${String(reason).slice(0, 200)}`, (req as any).staff?.id);

  if (!updated) return res.status(404).json({ error: "Claim not found" });
  return res.json(updated);
});

// ── Merge Requests ────────────────────────────────────────────────────────────

router.get("/admin/merge-requests", requirePermission("artists.approve"), async (_req, res) => {
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

router.patch("/admin/merge-requests/:id", requirePermission("artists.approve"), async (req, res) => {
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
  if (updated && status !== "contacted") await closeEntityTasks("merge_request", id, `merge request ${status}`, (req as any).staff?.id);

  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// ── Set artist login password (creates a Maktaba account + links it to the artist record) ─

router.post("/admin/merge-requests/:id/set-password", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { password } = req.body ?? {};
  const pwErr = passwordProblem(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  const [mr] = await db
    .select()
    .from(artistMergeRequestsTable)
    .where(eq(artistMergeRequestsTable.id, id))
    .limit(1);
  if (!mr) return res.status(404).json({ error: "Merge request not found" });
  const email = mr.submittedEmail?.trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "No email address on this merge request" });

  // Reuse the account if this email already has one, otherwise create an artist account.
  let accountId: string;
  const existing = await findByIdentifier({ kind: "email", value: email });
  if (existing) {
    await db.update(authAccountsTable)
      .set({ passwordHash: await hashPassword(String(password)), failedLogins: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(authAccountsTable.emailHash, blindIndex(email)));
    await revokeSessions(existing.id);
    accountId = existing.id;
  } else {
    const created = await createAccount("artist", mr.submittedName || email, { kind: "email", value: email }, String(password));
    if (created === "exists") return res.status(409).json({ error: "An account with this email already exists." });
    accountId = created.id;
  }

  if (mr.artistId) {
    await db
      .update(artistsTable)
      .set({ clerkUserId: accountId, isVerified: "approved" })
      .where(eq(artistsTable.id, mr.artistId));
  }

  const [updated] = await db
    .update(artistMergeRequestsTable)
    .set({ status: "completed" })
    .where(eq(artistMergeRequestsTable.id, id))
    .returning();

  return res.json({ ok: true, clerkUserId: accountId, mergeRequest: updated });
});

// Deletes a gallery, its artist/artwork listings and its owner's sign-in account (email + password freed).
router.delete("/admin/galleries/:id", requireAdminSession, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [g] = await db.select().from(galleriesTable).where(eq(galleriesTable.id, id)).limit(1);
  if (!g) return res.status(404).json({ error: "Gallery not found" });
  await db.transaction(async (tx) => {
    await tx.delete(galleryArtworksTable).where(eq(galleryArtworksTable.galleryId, id));
    await tx.delete(galleryArtistsTable).where(eq(galleryArtistsTable.galleryId, id));
    await tx.delete(galleriesTable).where(eq(galleriesTable.id, id));
  });
  const account = await eraseAccount(g.clerkUserId);
  await closeEntityTasks("gallery", id, "gallery deleted");
  await db.insert(authEventsTable).values({ accountId: g.clerkUserId, event: `gallery_deleted_by:${actorOf(req)}`, ip: req.ip ?? null });
  return res.json({ ok: true, account });
});

// ── Sign-in accounts that no artist/gallery uses (e.g. left behind when an artist was deleted earlier) ──
router.get("/admin/accounts/unlinked", requireAdminSession, async (req, res) => {
  const role = req.query.role === "gallery_owner" ? "gallery_owner" : "artist";
  const used = role === "artist"
    ? (await db.select({ id: artistsTable.clerkUserId }).from(artistsTable)).map((r) => r.id)
    : (await db.select({ id: galleriesTable.clerkUserId }).from(galleriesTable)).map((r) => r.id);
  const usedSet = new Set(used.filter(Boolean));
  const rows = (await db.select().from(authAccountsTable).where(eq(authAccountsTable.role, role)).orderBy(desc(authAccountsTable.createdAt)))
    .filter((a) => !usedSet.has(a.id));
  return res.json(rows.map((a) => ({ ...accountView(a), createdAt: a.createdAt })));
});

/** Delete one sign-in account (frees its email/phone). Refused for staff, owners of an artist/gallery, or buyers with orders. */
router.delete("/admin/accounts/:id", requireAdminSession, async (req, res) => {
  const accountId = String(req.params.id);
  const result = await eraseAccount(accountId);
  if (!result.erased) return res.status(409).json({ error: result.reason ?? "Account not deleted." });
  await db.insert(authEventsTable).values({ accountId, event: `account_deleted_by:${actorOf(req)}`, ip: req.ip ?? null });
  return res.json({ ok: true, ...result });
});

export default router;
