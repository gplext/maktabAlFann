import type { Request, RequestHandler } from "express";

/**
 * A small fixed-window rate limiter, in memory.
 *
 * This is deliberately dependency-free and process-local. It is enough to stop
 * a single client hammering an unauthenticated endpoint — which is the actual
 * exposure on `/collector/account` and `/storage/uploads/request-url`. It is
 * NOT a defence against a distributed attack, and it resets on restart.
 *
 * If you ever run more than one API process, move this to Redis or put the
 * limit in front of the app at the proxy — otherwise each process gets its own
 * allowance and the effective limit multiplies.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Drop expired buckets occasionally so the map cannot grow without bound.
const SWEEP_EVERY_MS = 5 * 60_000;
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Client IP, honouring the proxy the app sits behind. */
export function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.ip || req.socket?.remoteAddress || "unknown";
}

export function rateLimit(options: {
  /** Bucket name, so two endpoints don't share an allowance. */
  name: string;
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  message?: string;
}): RequestHandler {
  const { name, limit, windowMs, message } = options;

  return (req, res, next) => {
    const now = Date.now();
    sweep(now);

    const key = `${name}:${clientIp(req)}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;

    if (bucket.count > limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      req.log?.warn({ key, count: bucket.count }, "Rate limit exceeded");
      return res.status(429).json({
        error: message ?? "Too many requests. Please try again shortly.",
        retryAfter,
      });
    }

    return next();
  };
}
