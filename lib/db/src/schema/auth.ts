import { pgTable, text, serial, integer, timestamp, json, index } from "drizzle-orm/pg-core";

/**
 * One account table for every kind of user (buyer, artist, gallery owner,
 * curator, staff...). Personal data is stored encrypted (AES-256-GCM, see
 * api-server/src/lib/crypto.ts); `*_hash` columns are HMAC blind indexes so we
 * can look a user up by email/phone without storing it in clear.
 *
 * `id` is a string ("u_<uuid>") on purpose: it goes into the existing
 * `user_id`-style columns, so all current ownership checks keep working.
 */
export const AUTH_ROLES = [
  "buyer", "artist", "gallery_owner", "artwork_owner",
  "curator", "handler", "coordinator", "assistant", "manager", "admin",
] as const;
export type AuthRole = (typeof AUTH_ROLES)[number];

/** Roles anyone may pick at sign-up. Everything else is invite-only. */
export const SELF_SIGNUP_ROLES = ["buyer", "artist", "gallery_owner", "artwork_owner"] as const;
export const INVITE_ROLES = ["curator", "handler", "coordinator", "assistant", "manager", "admin"] as const;

export const authAccountsTable = pgTable("auth_accounts", {
  id: text("id").primaryKey(),
  role: text("role").notNull(),
  status: text("status").notNull().default("active"), // active | suspended
  fullNameEnc: text("full_name_enc").notNull(),
  emailEnc: text("email_enc"),
  emailHash: text("email_hash").unique(),
  phoneEnc: text("phone_enc"),
  phoneHash: text("phone_hash").unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: timestamp("email_verified_at"),
  phoneVerifiedAt: timestamp("phone_verified_at"),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  lastLoginAt: timestamp("last_login_at"),
  /** TOTP secret (encrypted). Required for admin, manager and curator. */
  totpSecretEnc: text("totp_secret_enc"),
  mfaEnabledAt: timestamp("mfa_enabled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** One-time codes for email/phone verification and password reset. Stored hashed. */
export const authCodesTable = pgTable("auth_codes", {
  id: serial("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => authAccountsTable.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(), // verify_email | verify_phone | reset_password
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("auth_codes_account_idx").on(t.accountId, t.purpose)]);

/** Invites for roles nobody can self-register (curator, handler, staff...). Token stored hashed. */
export const authInvitesTable = pgTable("auth_invites", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  role: text("role").notNull(),
  note: text("note"),
  invitedBy: text("invited_by").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  usedByAccountId: text("used_by_account_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Append-only log of auth events (sign-up, login, failures, resets, invites). */
export const authEventsTable = pgTable("auth_events", {
  id: serial("id").primaryKey(),
  accountId: text("account_id"),
  event: text("event").notNull(),
  ip: text("ip"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("auth_events_account_idx").on(t.accountId)]);

/** Session store table used by connect-pg-simple (declared here so drizzle push keeps it). */
export const userSessionsTable = pgTable("user_sessions", {
  sid: text("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (t) => [index("user_sessions_expire_idx").on(t.expire)]);

export type AuthAccount = typeof authAccountsTable.$inferSelect;
