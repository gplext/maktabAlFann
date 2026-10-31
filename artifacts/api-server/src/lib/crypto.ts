import {
  createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes,
  randomInt, scrypt as scryptCb, timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { logger } from "./logger";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

/**
 * DATA_ENCRYPTION_KEY: 64 hex chars (32 bytes). Generate with `openssl rand -hex 32`.
 * Required in production. Losing it means encrypted personal data is unreadable,
 * so back it up separately from the database.
 */
function masterKey(): Buffer {
  const hex = process.env.DATA_ENCRYPTION_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, "hex");
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATA_ENCRYPTION_KEY (64 hex chars) must be set in production.");
  }
  logger.warn("DATA_ENCRYPTION_KEY not set — using a development-only key.");
  return Buffer.from(hkdfSync("sha256", process.env.SESSION_SECRET ?? "dev-secret-change-in-prod", "", "maktaba-dev-key", 32));
}

const MASTER = masterKey();
const ENC_KEY = Buffer.from(hkdfSync("sha256", MASTER, "", "maktaba/field-encryption/v1", 32));
const INDEX_KEY = Buffer.from(hkdfSync("sha256", MASTER, "", "maktaba/blind-index/v1", 32));
const CODE_KEY = Buffer.from(hkdfSync("sha256", MASTER, "", "maktaba/one-time-codes/v1", 32));

/** AES-256-GCM. Output: "v1:" + base64(iv | tag | ciphertext). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return "v1:" + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  if (!payload.startsWith("v1:")) throw new Error("Unknown ciphertext version");
  const buf = Buffer.from(payload.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", ENC_KEY, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** Deterministic keyed hash for looking up encrypted values (email/phone). */
export function blindIndex(value: string): string {
  return createHmac("sha256", INDEX_KEY).update(value).digest("hex");
}

/** Hash for short-lived one-time values (HMAC is enough). */
export function hashToken(value: string): string {
  return createHmac("sha256", CODE_KEY).update(value).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex"), bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

// ── Passwords: scrypt (memory-hard, built into Node — no native build on Windows) ──
const N = 32768, R = 8, P = 1, KEYLEN = 64;
const SCRYPT_OPTS = { N, r: R, p: P, maxmem: 128 * N * R * 2 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, SCRYPT_OPTS);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const opts = { N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * Number(n) * Number(r) * 2 };
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, opts);
  return timingSafeEqual(actual, expected);
}

/** Used when no account matches, so response time doesn't reveal whether it exists. */
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("not-a-real-password-placeholder");
  await verifyPassword(password, await dummyHash);
}
