import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import {
  db, authAccountsTable, authEventsTable, SELF_SIGNUP_ROLES, type AuthAccount,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { blindIndex, burnPasswordCheck, decrypt, encrypt, hashPassword, verifyPassword } from "../lib/crypto";
import { clientIp, rateLimit } from "../lib/rateLimit";
import { revokeSessions } from "../lib/auth";

/**
 * One simple sign-up / sign-in for every role.
 *   Sign up: full name + email OR phone + password (+ role for self-service roles).
 *   Sign in: email or phone + password.
 * No verification codes, no two-step codes. Staff accounts are created by an
 * admin/manager on the Staff page (POST /staff/members).
 */
const router: IRouter = Router();

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const GENERIC_LOGIN_ERROR = "Incorrect email/phone or password.";

const signupLimit = rateLimit({ name: "auth-signup", limit: 10, windowMs: 60 * 60_000 });
const loginLimit = rateLimit({ name: "auth-login", limit: 20, windowMs: 15 * 60_000 });

// ── Helpers ───────────────────────────────────────────────────────────────────
type Identifier = { kind: "email" | "phone"; value: string };

/** Accepts an email or a phone number. Pakistani 03xx numbers become +923xx. */
export type { Identifier };
export function parseIdentifier(raw: unknown): Identifier | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (v.includes("@")) {
    const email = v.toLowerCase();
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 200 ? { kind: "email", value: email } : null;
  }
  let phone = v.replace(/[\s\-().]/g, "");
  if (phone.startsWith("00")) phone = "+" + phone.slice(2);
  else if (/^03\d{9}$/.test(phone)) phone = "+92" + phone.slice(1);
  return /^\+\d{8,15}$/.test(phone) ? { kind: "phone", value: phone } : null;
}

export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== "string") return "Password is required.";
  if (pw.length < 6) return "Password must be at least 6 characters.";
  if (pw.length > 128) return "Password is too long.";
  return null;
}

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 120 ? name : null;
}

export async function findByIdentifier(id: Identifier): Promise<AuthAccount | undefined> {
  const col = id.kind === "email" ? authAccountsTable.emailHash : authAccountsTable.phoneHash;
  const [a] = await db.select().from(authAccountsTable).where(eq(col, blindIndex(id.value))).limit(1);
  return a;
}

async function logEvent(req: Request, event: string, accountId?: string | null) {
  try {
    await db.insert(authEventsTable).values({ event, accountId: accountId ?? null, ip: clientIp(req) });
  } catch (err) {
    req.log?.warn({ err, event }, "auth event not recorded");
  }
}

function publicUser(a: AuthAccount) {
  return {
    id: a.id,
    role: a.role,
    fullName: decrypt(a.fullNameEnc),
    email: decrypt(a.emailEnc),
    phone: decrypt(a.phoneEnc),
  };
}

/** New session id on every sign-in (prevents session fixation). */
function startSession(req: Request, res: Response, a: AuthAccount) {
  req.session.regenerate((err) => {
    if (err) {
      res.status(500).json({ error: "Session error" });
      return;
    }
    req.session.userId = a.id;
    req.session.userRole = a.role;
    // Old admin console access for admins and managers.
    if (a.role === "admin" || a.role === "manager") req.session.isAdmin = true;
    req.session.save((err2) => {
      if (err2) {
        res.status(500).json({ error: "Session error" });
        return;
      }
      res.json({ user: publicUser(a) });
    });
  });
}

export async function createAccount(role: string, fullName: string, id: Identifier, password: string): Promise<AuthAccount | "exists"> {
  if (await findByIdentifier(id)) return "exists";
  const [a] = await db.insert(authAccountsTable).values({
    id: "u_" + randomUUID(),
    role,
    fullNameEnc: encrypt(fullName),
    emailEnc: id.kind === "email" ? encrypt(id.value) : null,
    emailHash: id.kind === "email" ? blindIndex(id.value) : null,
    phoneEnc: id.kind === "phone" ? encrypt(id.value) : null,
    phoneHash: id.kind === "phone" ? blindIndex(id.value) : null,
    passwordHash: await hashPassword(password),
    // No verification step: the email/phone is accepted as entered.
    emailVerifiedAt: id.kind === "email" ? new Date() : null,
    phoneVerifiedAt: id.kind === "phone" ? new Date() : null,
  }).returning();
  return a!;
}

async function currentAccount(req: Request): Promise<AuthAccount | null> {
  const id = req.session?.userId;
  if (!id) return null;
  const [a] = await db.select().from(authAccountsTable).where(eq(authAccountsTable.id, id)).limit(1);
  return a && a.status === "active" ? a : null;
}

// ── Sign up ───────────────────────────────────────────────────────────────────
router.post("/auth/register", signupLimit, async (req, res) => {
  const { fullName, identifier, password, role = "buyer" } = req.body ?? {};
  const name = cleanName(fullName);
  const id = parseIdentifier(identifier);
  const pwErr = passwordProblem(password);
  if (!name) return res.status(400).json({ error: "Please enter your full name." });
  if (!id) return res.status(400).json({ error: "Enter a valid email or phone number." });
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (!(SELF_SIGNUP_ROLES as readonly string[]).includes(role)) {
    return res.status(400).json({ error: "Staff accounts are created by the admin." });
  }
  const a = await createAccount(role, name, id, password);
  if (a === "exists") {
    await burnPasswordCheck(password);
    return res.status(409).json({ error: "An account with these details already exists. Please sign in." });
  }
  await logEvent(req, "signup", a.id);
  return startSession(req, res, a);
});

// ── Sign in ───────────────────────────────────────────────────────────────────
router.post("/auth/login", loginLimit, async (req, res) => {
  const { identifier, password } = req.body ?? {};
  const id = parseIdentifier(identifier);
  if (!id || typeof password !== "string" || password.length > 128) {
    return res.status(400).json({ error: GENERIC_LOGIN_ERROR });
  }
  const a = await findByIdentifier(id);
  if (!a) {
    await burnPasswordCheck(password);
    await logEvent(req, "login_unknown");
    return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
  }
  if (a.lockedUntil && a.lockedUntil > new Date()) {
    await logEvent(req, "login_locked", a.id);
    return res.status(429).json({ error: `Too many attempts. Try again in ${LOCK_MINUTES} minutes or reset your password.` });
  }
  if (!(await verifyPassword(password, a.passwordHash))) {
    const failed = a.failedLogins + 1;
    await db.update(authAccountsTable).set({
      failedLogins: failed >= MAX_FAILED ? 0 : failed,
      lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : a.lockedUntil,
    }).where(eq(authAccountsTable.id, a.id));
    await logEvent(req, "login_failed", a.id);
    return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
  }
  if (a.status !== "active") return res.status(403).json({ error: "This account is suspended." });
  const [fresh] = await db.update(authAccountsTable)
    .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(authAccountsTable.id, a.id)).returning();
  await logEvent(req, "login", a.id);
  return startSession(req, res, fresh!);
});

router.post("/auth/logout", (req, res) => {
  const id = req.session?.userId;
  req.session.destroy(() => {
    res.clearCookie("maktaba.sid");
    res.json({ ok: true });
  });
  if (id) void logEvent(req, "logout", id);
});

router.get("/auth/me", async (req, res) => {
  const a = await currentAccount(req);
  res.json({ user: a ? publicUser(a) : null });
});

// ── Password change ───────────────────────────────────────────────────────────
router.post("/auth/password/change", async (req, res) => {
  const a = await currentAccount(req);
  if (!a) return res.status(401).json({ error: "Unauthorized" });
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== "string" || !(await verifyPassword(currentPassword, a.passwordHash))) {
    return res.status(400).json({ error: "Current password is incorrect." });
  }
  const pwErr = passwordProblem(newPassword);
  if (pwErr) return res.status(400).json({ error: pwErr });
  await db.update(authAccountsTable).set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(authAccountsTable.id, a.id));
  await revokeSessions(a.id, req.sessionID);
  await logEvent(req, "password_changed", a.id);
  res.json({ ok: true });
});

export default router;
