/**
 * Search-engine and link-preview support for the single-page app.
 *
 * The React app renders in the browser, so crawlers and WhatsApp/Facebook link
 * previews only see the HTML shell. Before sending that shell, the server fills
 * in the page's own title, description, canonical URL, share image and
 * structured data (JSON-LD), and sends 404 for pages that don't exist.
 * It also serves /robots.txt and /sitemap.xml.
 */
import fs from "node:fs";
import path from "node:path";
import type { Request } from "express";
import { db, artworksTable, artistsTable, artCategoriesTable, artStylesTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { artworkAvailability } from "./orders";

const SITE_NAME = "Maktaba Al-Fann";
const DEFAULT_TITLE = "Maktaba Al-Fann — Online Gallery of Pakistani Art";
const DEFAULT_DESC =
  "Maktaba Al-Fann is an exclusive online gallery of paintings, drawings, sculpture and printmaking by Pakistani artists — each work presented with its style, technique and the story of its maker.";
const DEFAULT_IMAGE = "/opengraph.jpg";

/** Pages that never belong in search results. */
const PRIVATE = /^\/(admin|staff|account|cart|museum|portals|collector|artist-portal|gallery-portal|sign-in|sign-up)(\/|$)/;

/** Every route the React app knows (anything else is a 404). */
const KNOWN = [
  /^\/$/, /^\/art$/, /^\/art\/\d+$/, /^\/artists$/, /^\/artists\/\d+$/, /^\/specialty$/, /^\/shop$/,
  /^\/about$/, /^\/cart$/, /^\/museum$/, /^\/account$/, /^\/portals$/, /^\/collector$/, /^\/staff$/,
  /^\/admin(\/login)?$/, /^\/artist-portal(\/register|\/submit)?$/, /^\/gallery-portal$/, /^\/sign-(in|up)(\/.*)?$/,
];

const STATIC_PAGES: Record<string, { title: string; description: string }> = {
  "/": { title: DEFAULT_TITLE, description: DEFAULT_DESC },
  "/art": {
    title: "Buy Original Pakistani Paintings Online | Maktaba Al-Fann",
    description:
      "Browse original paintings, calligraphy, drawings and sculpture by Pakistani artists. Filter by style, medium and size, and order online with delivery in Pakistan and abroad.",
  },
  "/artists": {
    title: "Pakistani Artists — Painters & Sculptors | Maktaba Al-Fann",
    description:
      "Meet the Pakistani artists of Maktaba Al-Fann: their stories, styles, influences and original works available to buy online.",
  },
  "/specialty": {
    title: "Specialty Art — Sculpture, Handicraft & AI Art | Maktaba Al-Fann",
    description:
      "Discover specialty works by Pakistani creators: sculpture, traditional handicraft and AI art, each with the story of its making.",
  },
  "/shop": {
    title: "Frames, Hanging Supports & Art Supplies | Maktaba Al-Fann",
    description:
      "Frames, hanging supports and art supplies chosen to fit and protect the artworks in the Maktaba Al-Fann collection.",
  },
  "/about": {
    title: "Our Story — Maktaba Al-Fann, Lahore",
    description:
      "Maktaba Al-Fann is an online gallery from Lahore presenting Pakistani art with the story, style and technique behind every work.",
  },
};

export function siteUrl(req: Request): string {
  return (process.env.SITE_URL ?? `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
};
const abs = (base: string, u: string | null | undefined) =>
  !u ? `${base}${DEFAULT_IMAGE}` : /^https?:\/\//.test(u) ? u : `${base}${u.startsWith("/") ? "" : "/"}${u}`;

export type PageMeta = {
  status: number;
  title: string;
  description: string;
  canonical: string;
  image: string;
  type: string;
  noindex: boolean;
  jsonLd: object[];
};

function breadcrumbs(base: string, items: [string, string][]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${base}${url}` })),
  };
}

function organization(base: string) {
  const phone = process.env.WHATSAPP_NUMBER;
  return [
    {
      "@context": "https://schema.org",
      "@type": "ArtGallery",
      "@id": `${base}/#gallery`,
      name: SITE_NAME,
      alternateName: "مکتبۃ الفن",
      url: `${base}/`,
      logo: `${base}/logo.svg`,
      image: `${base}${DEFAULT_IMAGE}`,
      description: DEFAULT_DESC,
      foundingDate: "2025",
      address: { "@type": "PostalAddress", addressLocality: "Lahore", addressCountry: "PK" },
      ...(phone ? { telephone: phone, contactPoint: { "@type": "ContactPoint", telephone: phone, contactType: "sales", availableLanguage: ["English", "Urdu"] } } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${base}/#website`,
      name: SITE_NAME,
      url: `${base}/`,
      publisher: { "@id": `${base}/#gallery` },
    },
  ];
}

async function artworkMeta(base: string, id: number): Promise<PageMeta | null> {
  const [a] = await db
    .select({
      id: artworksTable.id, title: artworksTable.title, imageUrl: artworksTable.imageUrl,
      shortDescription: artworksTable.shortDescription, year: artworksTable.year, medium: artworksTable.medium,
      widthCm: artworksTable.widthCm, heightCm: artworksTable.heightCm, displayPrice: artworksTable.displayPrice,
      artistId: artistsTable.id, artistName: artistsTable.name, artistCountry: artistsTable.country,
      category: artCategoriesTable.name, style: artStylesTable.name,
    })
    .from(artworksTable)
    .innerJoin(artistsTable, eq(artworksTable.artistId, artistsTable.id))
    .innerJoin(artCategoriesTable, eq(artworksTable.artCategoryId, artCategoriesTable.id))
    .leftJoin(artStylesTable, eq(artworksTable.artStyleId, artStylesTable.id))
    .where(and(eq(artworksTable.id, id), eq(artworksTable.status, "approved"), eq(artistsTable.isVerified, "approved")));
  if (!a) return null;

  const url = `${base}/art/${a.id}`;
  const image = abs(base, a.imageUrl);
  const kind = a.style || a.category;
  const title = clip(`${a.title} by ${a.artistName} — ${kind} | ${SITE_NAME}`, 70);
  const lead = (a.shortDescription ?? "").trim();
  const about = `An original work by Pakistani artist ${a.artistName} — ${kind}${a.year ? `, ${a.year}` : ""}${a.widthCm && a.heightCm ? `, ${a.widthCm} × ${a.heightCm} cm` : ""}. Available at ${SITE_NAME}.`;
  const description = clip(lead.length >= 70 ? lead : `${lead ? lead.replace(/[.\s]*$/, ". ") : ""}${about}`, 160);
  const held = (await artworkAvailability([a.id])).get(a.id);
  const price = a.displayPrice != null ? Number(a.displayPrice) : null;

  const artwork: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": price != null ? ["VisualArtwork", "Product"] : "VisualArtwork",
    "@id": `${url}#artwork`,
    name: a.title,
    url,
    image,
    description,
    creator: { "@type": "Person", name: a.artistName, url: `${base}/artists/${a.artistId}` },
    artform: a.category,
    ...(a.style ? { genre: a.style } : {}),
    ...(a.medium ? { artMedium: a.medium } : {}),
    ...(a.year ? { dateCreated: String(a.year) } : {}),
    ...(a.widthCm ? { width: { "@type": "Distance", name: `${a.widthCm} cm` } } : {}),
    ...(a.heightCm ? { height: { "@type": "Distance", name: `${a.heightCm} cm` } } : {}),
  };
  if (price != null) {
    Object.assign(artwork, {
      brand: { "@type": "Brand", name: SITE_NAME },
      sku: `MAF-${a.id}`,
      offers: {
        "@type": "Offer",
        url,
        price: price.toFixed(0),
        priceCurrency: "PKR",
        availability: held === "sold" ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
        seller: { "@id": `${base}/#gallery` },
      },
    });
  }
  return {
    status: 200, title, description, canonical: url, image, type: "product", noindex: false,
    jsonLd: [artwork, breadcrumbs(base, [["Home", "/"], ["Artworks", "/art"], [a.title, `/art/${a.id}`]])],
  };
}

async function artistMeta(base: string, id: number): Promise<PageMeta | null> {
  const [a] = await db
    .select({ id: artistsTable.id, name: artistsTable.name, country: artistsTable.country, style: artistsTable.style, photoUrl: artistsTable.photoUrl, shortBio: artistsTable.shortBio, websiteUrl: artistsTable.websiteUrl })
    .from(artistsTable)
    .where(and(eq(artistsTable.id, id), eq(artistsTable.isVerified, "approved")));
  if (!a) return null;
  const url = `${base}/artists/${a.id}`;
  const image = abs(base, a.photoUrl);
  const where = a.country || "Pakistan";
  const title = clip(`${a.name} — ${where === "Pakistan" ? "Pakistani" : where} Artist${a.style ? `, ${a.style}` : ""} | ${SITE_NAME}`, 70);
  const bio = (a.shortBio ?? "").trim();
  const description = clip(bio.length >= 70 ? bio : `${bio ? bio.replace(/[.\s]*$/, ". ") : ""}${a.name} is an artist from ${where}. See their story and original works at ${SITE_NAME}.`, 160);
  return {
    status: 200, title, description, canonical: url, image, type: "profile", noindex: false,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Person",
        "@id": `${url}#artist`,
        name: a.name,
        url,
        image,
        description,
        jobTitle: "Artist",
        nationality: { "@type": "Country", name: where },
        ...(a.websiteUrl ? { sameAs: [a.websiteUrl] } : {}),
      },
      breadcrumbs(base, [["Home", "/"], ["Artists", "/artists"], [a.name, `/artists/${a.id}`]]),
    ],
  };
}

/** Meta for any path the SPA fallback serves. */
export async function pageMeta(req: Request, pathname: string): Promise<PageMeta> {
  const base = siteUrl(req);
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const page = (title: string, description: string, extra: Partial<PageMeta> = {}): PageMeta => ({
    status: 200, title, description, canonical: `${base}${p}`, image: `${base}${DEFAULT_IMAGE}`, type: "website", noindex: false, jsonLd: [], ...extra,
  });
  const notFound = () => page(`Page not found | ${SITE_NAME}`, DEFAULT_DESC, { status: 404, noindex: true });

  if (!KNOWN.some((r) => r.test(p))) return notFound();

  try {
    let m = /^\/art\/(\d+)$/.exec(p);
    if (m) return (await artworkMeta(base, Number(m[1]))) ?? notFound();
    m = /^\/artists\/(\d+)$/.exec(p);
    if (m) return (await artistMeta(base, Number(m[1]))) ?? notFound();
  } catch {
    // Database trouble must never take the page down: fall back to the default tags.
    return page(DEFAULT_TITLE, DEFAULT_DESC);
  }

  if (PRIVATE.test(p)) return page(SITE_NAME, DEFAULT_DESC, { noindex: true });
  const s = STATIC_PAGES[p] ?? { title: DEFAULT_TITLE, description: DEFAULT_DESC };
  const extra: Partial<PageMeta> = {};
  if (p === "/") extra.jsonLd = organization(base);
  else extra.jsonLd = [breadcrumbs(base, [["Home", "/"], [s.title.split(/ [—|] /)[0]!, p]])];
  return page(s.title, s.description, extra);
}

/** Replaces the generic head tags in index.html with the page's own. */
export function renderHead(html: string, m: PageMeta): string {
  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name="(description|robots)"[\s\S]*?\/?>/gi, "")
    .replace(/<meta\s+(property="og:[^"]*"|name="twitter:[^"]*")[\s\S]*?\/?>/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>/gi, "");
  const tags = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    `<meta name="robots" content="${m.noindex ? "noindex, follow" : "index, follow, max-image-preview:large"}" />`,
    m.noindex ? "" : `<link rel="canonical" href="${esc(m.canonical)}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:type" content="${m.type}" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:url" content="${esc(m.canonical)}" />`,
    `<meta property="og:image" content="${esc(m.image)}" />`,
    `<meta property="og:image:alt" content="${esc(m.title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    `<meta name="twitter:image" content="${esc(m.image)}" />`,
    ...m.jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`),
  ].filter(Boolean);
  return stripped.replace(/<\/head>/i, `    ${tags.join("\n    ")}\n  </head>`);
}

export function robotsTxt(req: Request): string {
  return [
    "User-agent: *",
    "Allow: /",
    ...["/admin", "/staff", "/account", "/cart", "/museum", "/portals", "/collector", "/artist-portal", "/gallery-portal", "/sign-in", "/sign-up", "/api/"].map((d) => `Disallow: ${d}`),
    "Allow: /api/storage/",
    "",
    `Sitemap: ${siteUrl(req)}/sitemap.xml`,
    "",
  ].join("\n");
}

export async function sitemapXml(req: Request): Promise<string> {
  const base = siteUrl(req);
  const day = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : undefined);
  const artworks = await db
    .select({ id: artworksTable.id, updatedAt: artworksTable.updatedAt })
    .from(artworksTable)
    .innerJoin(artistsTable, eq(artworksTable.artistId, artistsTable.id))
    .where(and(eq(artworksTable.status, "approved"), eq(artistsTable.isVerified, "approved")))
    .orderBy(desc(artworksTable.updatedAt));
  const artists = await db
    .select({ id: artistsTable.id, updatedAt: artistsTable.updatedAt })
    .from(artistsTable)
    .where(eq(artistsTable.isVerified, "approved"));
  const newest = day(artworks[0]?.updatedAt);
  const urls: { loc: string; lastmod?: string; priority: string }[] = [
    { loc: "/", lastmod: newest, priority: "1.0" },
    { loc: "/art", lastmod: newest, priority: "0.9" },
    { loc: "/artists", priority: "0.8" },
    { loc: "/specialty", priority: "0.6" },
    { loc: "/shop", priority: "0.5" },
    { loc: "/about", priority: "0.4" },
    ...artworks.map((a) => ({ loc: `/art/${a.id}`, lastmod: day(a.updatedAt), priority: "0.8" })),
    ...artists.map((a) => ({ loc: `/artists/${a.id}`, lastmod: day(a.updatedAt), priority: "0.7" })),
  ];
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls.map((u) => `  <url><loc>${base}${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<priority>${u.priority}</priority></url>`),
    `</urlset>`,
    "",
  ].join("\n");
}

/** Reads index.html once; re-reads if the file changes (local dev). */
let cache: { file: string; mtime: number; html: string } | null = null;
export function indexHtml(staticDir: string): string {
  const file = path.join(staticDir, "index.html");
  const mtime = fs.statSync(file).mtimeMs;
  if (!cache || cache.file !== file || cache.mtime !== mtime) cache = { file, mtime, html: fs.readFileSync(file, "utf8") };
  return cache.html;
}
