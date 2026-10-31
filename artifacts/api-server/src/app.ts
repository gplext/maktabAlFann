import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import { handleStripeEvent, verifyStripeSignature } from "./lib/orders";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Credentialed CORS must not reflect every origin. Same-origin requests (the
// site and /api on one domain) don't need CORS at all; list any other front-end
// origins in CORS_ORIGINS (comma-separated). Development stays permissive.
const corsOrigins = (process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({
  credentials: true,
  origin: corsOrigins.length ? corsOrigins : process.env.NODE_ENV !== "production",
}));

// Stripe webhook needs the raw body for its signature check, so it is mounted
// before the JSON parser.
app.post("/api/payments/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!verifyStripeSignature(req.body as Buffer, req.header("stripe-signature"))) {
    res.status(400).json({ error: "Invalid signature" });
    return;
  }
  try {
    await handleStripeEvent(JSON.parse((req.body as Buffer).toString("utf8")));
    res.json({ received: true });
  } catch (err) {
    req.log?.error({ err }, "Stripe webhook failed");
    res.status(500).json({ error: "Webhook handling failed" });
  }
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const isProduction = process.env.NODE_ENV === "production";

// A predictable session secret means anyone can forge an admin session cookie.
// Fail at boot rather than run insecurely.
if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in production.");
}

// Required for `secure` cookies to be set at all behind a TLS-terminating
// proxy: without it Express sees plain HTTP on the internal hop, decides the
// connection is insecure, and silently drops the cookie — which would lock you
// out of the admin console.
if (isProduction) app.set("trust proxy", 1);

// Sessions live in Postgres so sign-ins survive restarts and multiple processes.
const PgStore = connectPgSimple(session);

app.use(
  session({
    store: new PgStore({ pool, tableName: "user_sessions", createTableIfMissing: false, pruneSessionInterval: 60 * 15 }),
    secret: process.env.SESSION_SECRET ?? "dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    // Don't advertise Express in the cookie name.
    name: "maktaba.sid",
    cookie: {
      httpOnly: true,
      // Was hardcoded to false, so the admin session cookie travelled in clear
      // over plain HTTP and could be lifted off the wire.
      secure: isProduction,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

app.use("/api", router);

// Production (Docker / Coolify): the same server also serves the built website,
// so the site and /api share one domain. STATIC_DIR = artifacts/art-gallery/dist/public.
const staticDir = process.env.STATIC_DIR;
if (staticDir && fs.existsSync(path.join(staticDir, "index.html"))) {
  // Vite bundles have a content hash in the file name, so they never change: cache for a year.
  app.use("/assets", express.static(path.join(staticDir, "assets"), { immutable: true, maxAge: "365d", index: false }));
  // Other public files (logo, artwork images, frame textures): cache for a week.
  // redirect:false: folders such as /artworks share names with site pages, so never redirect to "/artworks/".
  app.use(express.static(staticDir, { maxAge: "7d", index: false, redirect: false }));
  // Every other GET outside /api and /assets is a page of the single-page app. index.html is
  // never cached, so visitors pick up a new deploy straight away.
  app.get(/^(?!\/(api|assets)(\/|$)).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

export default app;
