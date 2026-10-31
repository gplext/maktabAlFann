import type { Request, RequestHandler } from "express";
import { db, authAccountsTable, userSessionsTable } from "@workspace/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { decrypt } from "./crypto";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    userRole?: string;
  }
}

/**
 * Signs an account out everywhere (optionally keeping one session). Used after a
 * password change/reset and whenever staff change someone's level or suspend them,
 * so a stale cookie can't keep old rights.
 */
export async function revokeSessions(accountId: string, keepSid?: string) {
  const owned = sql`${userSessionsTable.sess}->>'userId' = ${accountId}`;
  await db.delete(userSessionsTable).where(keepSid ? and(owned, ne(userSessionsTable.sid, keepSid)) : owned);
}

/** The signed-in user's id (from our own session cookie). */
export function getUserId(req: Request): string | null {
  return req.session?.userId ?? null;
}

export const requireUser: RequestHandler = (req, res, next) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).userId = userId;
  next();
};

export type Identity = {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  createdAtMs: number;
};

/** Name/email for a user id. */
export async function getIdentity(userId: string): Promise<Identity> {
  const [a] = await db.select().from(authAccountsTable).where(eq(authAccountsTable.id, userId)).limit(1);
  if (!a) throw new Error("Account not found");
  const [firstName = "", ...rest] = (decrypt(a.fullNameEnc) ?? "").trim().split(/\s+/);
  return {
    email: decrypt(a.emailEnc) ?? "",
    phone: decrypt(a.phoneEnc) ?? "",
    firstName,
    lastName: rest.join(" "),
    emailVerified: true,
    createdAtMs: a.createdAt.getTime(),
  };
}
