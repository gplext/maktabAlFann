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
import { pageMeta, renderHead, robotsTxt, sitemapXml, indexHtml } from "./lib/seo";

const app: Express = express();

// Security headers (also a trust signal for search engines). No "X-Powered-By: Express".
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000");
  next();
});

// Domain move: requests to an old address (REDIRECT_FROM_HOSTS, e.g. "art.saadgul.com") are sent
// permanently (301) to the same page on SITE_URL, so links, bookmarks and Google rankings carry over.
// Off until both settings are set. Search Console verification files stay reachable on the old host.
const siteUrl = (process.env.SITE_URL ?? "").replace(/\/$/, "");
const oldHosts = (process.env.REDIRECT_FROM_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
if (siteUrl && oldHosts.length) {
  const target = new URL(siteUrl).host.toLowerCase();
  app.use((req, res, next) => {
    const host = (req.headers.host ?? "").split(":")[0]!.toLowerCase();
    if (host === target || !oldHosts.includes(host) || /^\/google[0-9a-f]+\.html$/.test(req.path)) return next();
    res.redirect(req.method === "GET" || req.method === "HEAD" ? 301 : 308, siteUrl + req.originalUrl);
  });
}

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
  // robots.txt and sitemap.xml are generated (sitemap lists every public artwork and artist).
  app.get("/robots.txt", (req, res) => {
    res.type("text/plain").setHeader("Cache-Control", "public, max-age=3600");
    res.send(robotsTxt(req));
  });
  app.get("/sitemap.xml", async (req, res) => {
    try {
      res.type("application/xml").setHeader("Cache-Control", "public, max-age=3600");
      res.send(await sitemapXml(req));
    } catch (err) {
      req.log?.error({ err }, "sitemap failed");
      res.status(500).type("text/plain").send("Sitemap unavailable");
    }
  });
  // Every other GET outside /api and /assets is a page of the single-page app. The server
  // fills in that page's title, description, share image and structured data, and answers
  // 404 for pages that don't exist. index.html is never cached, so a new deploy shows at once.
  app.get(/^(?!\/(api|assets)(\/|$)).*/, async (req, res) => {
    const meta = await pageMeta(req, req.path);
    res.status(meta.status).setHeader("Cache-Control", "no-cache");
    if (meta.noindex) res.setHeader("X-Robots-Tag", "noindex");
    res.type("html").send(renderHead(indexHtml(staticDir), meta));
  });
}

export default app;
