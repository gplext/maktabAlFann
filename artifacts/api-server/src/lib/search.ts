import { sql, type SQL } from "drizzle-orm";
import { db, artworksTable, artistsTable, artCategoriesTable, artStylesTable } from "@workspace/db";

/**
 * Artwork search, done inside PostgreSQL.
 *
 * - Full-text search with English stemming and prefix matching, so "mountains"
 *   finds "mountain" and "hunz" (while typing) finds "Hunza".
 * - Typo tolerance with pg_trgm ("hunsa" finds "Hunza"), when that extension
 *   can be enabled; otherwise a plain "contains" match is used instead.
 * - Every word must match somewhere (title, subject, artist, style, art type,
 *   medium or description). Results are ranked: title and subject weigh most,
 *   the description least.
 *
 * Queries that use these helpers must join artists, art_categories and art_styles.
 */

/** pg_trgm is a "trusted" extension (PostgreSQL 13+): the database owner can enable it. */
let trigram: Promise<boolean> | null = null;
export function trigramReady(): Promise<boolean> {
  trigram ??= db
    .execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`)
    .then(() => true, () => false);
  return trigram;
}

const STOPWORDS = new Set(["a", "an", "the", "of", "and", "or", "in", "on", "at", "to", "for", "with", "by", "from", "is", "are"]);

/** "Hunza  valley's!" → ["hunza", "valley"] — letters and digits only, so safe inside tsquery. */
export function searchWords(q: string): string[] {
  const all = q.toLowerCase().normalize("NFKC").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0);
  const meaningful = all.filter((w) => !STOPWORDS.has(w));
  // A search made only of small words ("the") still searches for them.
  return [...new Set(meaningful.length ? meaningful : all)].slice(0, 8);
}

/** Words the collection spells differently from visitors (British/US spelling, the gallery's own terms). */
const SYNONYMS: string[][] = [
  ["watercolor", "watercolour", "waterpaint", "waterpaints"],
  ["color", "colour"], ["colors", "colours"], ["gray", "grey"],
  ["sketch", "drawing"], ["sketches", "drawings"],
];
const variants = (w: string) => SYNONYMS.find((g) => g.includes(w)) ?? [w];

const text = (col: unknown) => sql`coalesce(${col}, '')`;

/** Weighted document: A = title + subject, B = artist + style + art type, C = medium, D = description. */
const DOCUMENT = sql`(
  setweight(to_tsvector('english', ${text(artworksTable.title)} || ' ' || ${text(artworksTable.theme)}), 'A') ||
  setweight(to_tsvector('english', ${text(artistsTable.name)} || ' ' || ${text(artStylesTable.name)} || ' ' || ${text(artCategoriesTable.name)}), 'B') ||
  setweight(to_tsvector('english', ${text(artworksTable.medium)}), 'C') ||
  setweight(to_tsvector('english', ${text(artworksTable.shortDescription)}), 'D')
)`;

/** The short, high-value text that typo matching compares against. */
const NAMES = sql`lower(${text(artworksTable.title)} || ' ' || ${text(artworksTable.theme)} || ' ' || ${text(artistsTable.name)} || ' ' || ${text(artStylesTable.name)} || ' ' || ${text(artCategoriesTable.name)})`;
const EVERYTHING = sql`lower(${NAMES} || ' ' || ${text(artworksTable.medium)} || ' ' || ${text(artworksTable.shortDescription)})`;

export type ArtworkSearch = { where: SQL; rank: SQL } | null;

/** WHERE condition and ranking expression for a search phrase (null = nothing to search for). */
export async function artworkSearch(q: string | undefined | null): Promise<ArtworkSearch> {
  const words = searchWords(q ?? "");
  if (words.length === 0) return null;
  const fuzzy = await trigramReady();

  const perWord = words.map((word) => {
    const parts: SQL[] = [];
    for (const w of variants(word)) {
      const like = `%${w.replace(/[%_\\]/g, "\\$&")}%`;
      parts.push(sql`${DOCUMENT} @@ to_tsquery('english', ${`${w}:*`})`, sql`${EVERYTHING} LIKE ${like}`);
    }
    // Typos only for words of 4+ letters: shorter words match too much by similarity.
    if (fuzzy && word.length >= 4) parts.push(sql`word_similarity(${word}, ${NAMES}) >= 0.5`);
    return sql`(${sql.join(parts, sql` OR `)})`;
  });

  const anyWord = words.flatMap(variants).map((w) => `${w}:*`).join(" | ");
  const rank = fuzzy
    ? sql`(ts_rank(${DOCUMENT}, to_tsquery('english', ${anyWord})) + word_similarity(${words.join(" ")}, ${NAMES}))`
    : sql`ts_rank(${DOCUMENT}, to_tsquery('english', ${anyWord}))`;

  return { where: sql`(${sql.join(perWord, sql` AND `)})`, rank };
}

/**
 * "Did you mean": for each word, the closest word that actually appears in the
 * public collection (titles, subjects, artists, styles). Null when nothing is close
 * or the phrase is already spelled like the collection.
 */
export async function didYouMean(q: string, publicOnly: SQL): Promise<string | null> {
  const words = searchWords(q);
  if (words.length === 0 || !(await trigramReady())) return null;
  const fixed: string[] = [];
  let changed = false;
  for (const w of words) {
    const res = await db.execute(sql`
      SELECT v.word, similarity(v.word, ${w}) AS s FROM (
        SELECT DISTINCT regexp_split_to_table(${NAMES}, '[^[:alnum:]]+') AS word
        FROM ${artworksTable}
        JOIN ${artistsTable} ON ${artistsTable.id} = ${artworksTable.artistId}
        JOIN ${artCategoriesTable} ON ${artCategoriesTable.id} = ${artworksTable.artCategoryId}
        LEFT JOIN ${artStylesTable} ON ${artStylesTable.id} = ${artworksTable.artStyleId}
        WHERE ${publicOnly}
      ) v
      WHERE length(v.word) > 2
      ORDER BY s DESC
      LIMIT 1`);
    const best = res.rows[0] as { word: string; s: number } | undefined;
    if (best && Number(best.s) >= 0.3 && best.word !== w) { fixed.push(best.word); changed = true; }
    else fixed.push(w);
  }
  return changed ? fixed.join(" ") : null;
}
