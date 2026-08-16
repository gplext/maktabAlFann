import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { eq, and } from "drizzle-orm";
import {
  db,
  artworksTable,
  artistsTable,
  artCategoriesTable,
  artStylesTable,
  sizesTable,
} from "@workspace/db";
import { SearchArtworksBody, ListArtworksResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const SELECT_FIELDS = {
  id: artworksTable.id,
  title: artworksTable.title,
  artistId: artworksTable.artistId,
  artistName: artistsTable.name,
  artCategoryId: artworksTable.artCategoryId,
  artCategory: artCategoriesTable.name,
  artStyleId: artworksTable.artStyleId,
  artStyle: artStylesTable.name,
  nationality: artistsTable.country,
  theme: artworksTable.theme,
  sizeId: artworksTable.sizeId,
  size: sizesTable.code,
  sizeLabel: sizesTable.label,
  year: artworksTable.year,
  imageUrl: artworksTable.imageUrl,
  thumbnailUrl: artworksTable.thumbnailUrl,
  shortDescription: artworksTable.shortDescription,
  isFeatured: artworksTable.isFeatured,
  specialtyType: artworksTable.specialtyType,
} as const;

async function extractKeywords(query: string): Promise<string[]> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const systemPrompt = `You are a search assistant for Maktaba Al-Fann, a Pakistani art gallery.
Given a natural-language search query, extract 2-5 meaningful search keywords that could match artwork titles, themes, art styles, subjects, or artist names.

Focus on concrete nouns and descriptive words: places, emotions, subjects, colors, artistic styles, nature elements.
Convert abstract feelings to concrete terms (e.g. "peaceful" → "calm", "valley", "serene"; "sad" → "grief", "weeping", "tears").

Return ONLY a JSON array of lowercase strings, e.g. ["mountain", "valley", "landscape", "hunza"]`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 128,
      messages: [{ role: "user", content: query }],
      system: systemPrompt,
    });

    const text = message.content[0]?.type === "text" ? message.content[0].text : "[]";
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (!arrMatch) return [query.toLowerCase()];
    const parsed = JSON.parse(arrMatch[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) return [query.toLowerCase()];
    return parsed.filter((k): k is string => typeof k === "string" && k.length > 0);
  } catch {
    return query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  }
}

function scoreArtwork(
  artwork: {
    title: string;
    artistName: string;
    artStyle: string | null;
    artCategory: string | null;
    theme: string | null;
    shortDescription: string | null;
  },
  keywords: string[]
): number {
  const fields = [
    { text: artwork.title.toLowerCase(), weight: 3 },
    { text: (artwork.theme ?? "").toLowerCase(), weight: 3 },
    { text: (artwork.artStyle ?? "").toLowerCase(), weight: 2 },
    { text: (artwork.artCategory ?? "").toLowerCase(), weight: 2 },
    { text: artwork.artistName.toLowerCase(), weight: 2 },
    { text: (artwork.shortDescription ?? "").toLowerCase(), weight: 1 },
  ];

  let score = 0;
  for (const kw of keywords) {
    for (const { text, weight } of fields) {
      if (text.includes(kw)) score += weight;
    }
  }
  return score;
}

router.post("/artworks/search", async (req, res): Promise<void> => {
  const body = SearchArtworksBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  const rawQuery = body.data.query.trim();

  const keywords = await extractKeywords(rawQuery);

  const all = await db
    .select(SELECT_FIELDS)
    .from(artworksTable)
    .innerJoin(artistsTable, eq(artworksTable.artistId, artistsTable.id))
    .innerJoin(artCategoriesTable, eq(artworksTable.artCategoryId, artCategoriesTable.id))
    .leftJoin(artStylesTable, eq(artworksTable.artStyleId, artStylesTable.id))
    .leftJoin(sizesTable, eq(artworksTable.sizeId, sizesTable.id))
    .where(and(eq(artworksTable.status, "approved"), eq(artistsTable.isVerified, "approved")))
    .limit(500);

  const scored = all
    .map((artwork) => ({ artwork, score: scoreArtwork(artwork, keywords) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    // artType is a deprecated alias of artStyle — see api-zod.
    .map(({ artwork }) => ({ ...artwork, artType: artwork.artStyle }));

  res.json(ListArtworksResponse.parse(scored));
});

export default router;
