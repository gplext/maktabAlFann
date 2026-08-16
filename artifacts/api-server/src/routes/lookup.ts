import { Router } from "express";
import {
  db,
  artworkTypesTable,
  artCategoriesTable,
  artStylesTable,
  mediumsTable,
  techniquesTable,
  sizesTable,
  tagsTable,
  storageLocationsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

const SEED_ARTWORK_TYPES = [
  "Oil on Canvas", "Watercolor", "Acrylic", "Miniature",
  "Sculpture", "Charcoal", "Ink", "Pastel", "Digital",
  "Mixed Media", "Gouache", "Fresco", "Tempera",
];

const SEED_STORAGE_LOCATIONS = [
  "Company warehouse",
  "Artist owned",
  "Other warehouse",
  "Retailer",
  "Distributor",
  "Open market",
];

const SEED_ART_CATEGORIES = [
  "Paintings", "Sculptures", "Drawings",
  "Printmaking", "Photography", "AI Assisted",
];
const SEED_ART_STYLES = [
  "Impressionism", "Cubism", "Realism", "Abstract",
  "Expressionism", "Surrealism", "Minimalism", "Contemporary",
  "Mughal Miniature", "Folk Art",
];
const SEED_MEDIUMS = [
  "Oil on Canvas", "Watercolor", "Acrylic",
  "Marble", "Bronze", "Charcoal", "Ink",
  "Pastel", "Digital", "Mixed Media", "Miniature Paint",
];
const SEED_TECHNIQUES = [
  "Thick Impasto", "Brushwork", "Wash",
  "Cross-hatching", "Stippling", "Glazing",
  "Dry Brush", "Pointillism",
];
const SEED_SIZES = [
  { code: "LL", label: "Extra Large", description: "Above 120 cm",     displayOrder: 0 },
  { code: "L",  label: "Large",       description: "80–120 cm",        displayOrder: 1 },
  { code: "M",  label: "Medium",      description: "50–80 cm",         displayOrder: 2 },
  { code: "MS", label: "Medium Small",description: "30–50 cm",         displayOrder: 3 },
  { code: "S",  label: "Small",       description: "Below 30 cm",      displayOrder: 4 },
];

async function seedIfEmpty() {
  try {
    // Each table seeded independently so adding new lookup tables never gets skipped
    const [typeRow] = await db.select({ n: sql<number>`count(*)::int` }).from(artworkTypesTable);
    if ((typeRow?.n ?? 0) === 0) {
      await db.insert(artworkTypesTable).values(SEED_ARTWORK_TYPES.map((name, i) => ({ name, displayOrder: i }))).onConflictDoNothing();
    }
    const [catRow] = await db.select({ n: sql<number>`count(*)::int` }).from(artCategoriesTable);
    if ((catRow?.n ?? 0) === 0) {
      await db.insert(artCategoriesTable).values(SEED_ART_CATEGORIES.map((name, i) => ({ name, displayOrder: i }))).onConflictDoNothing();
      await db.insert(artStylesTable).values(SEED_ART_STYLES.map((name, i) => ({ name, displayOrder: i }))).onConflictDoNothing();
      await db.insert(mediumsTable).values(SEED_MEDIUMS.map((name, i) => ({ name, displayOrder: i }))).onConflictDoNothing();
      await db.insert(techniquesTable).values(SEED_TECHNIQUES.map((name, i) => ({ name, displayOrder: i }))).onConflictDoNothing();
      await db.insert(sizesTable).values(SEED_SIZES).onConflictDoNothing();
    }
    // Storage locations seeded unconditionally — onConflictDoNothing is safe to run every boot
    await db.insert(storageLocationsTable).values(SEED_STORAGE_LOCATIONS.map((name) => ({ name }))).onConflictDoNothing();
  } catch {
  }
}

seedIfEmpty();

router.get("/lookup/artwork-types", async (_req, res) => {
  const rows = await db
    .select()
    .from(artworkTypesTable)
    .orderBy(artworkTypesTable.displayOrder);
  return res.json(rows);
});

router.get("/lookup/art-categories", async (_req, res) => {
  const rows = await db
    .select()
    .from(artCategoriesTable)
    .orderBy(artCategoriesTable.displayOrder);
  return res.json(rows);
});

router.get("/lookup/art-styles", async (_req, res) => {
  const rows = await db
    .select()
    .from(artStylesTable)
    .orderBy(artStylesTable.displayOrder);
  return res.json(rows);
});

router.get("/lookup/mediums", async (_req, res) => {
  const rows = await db
    .select()
    .from(mediumsTable)
    .orderBy(mediumsTable.displayOrder);
  return res.json(rows);
});

router.get("/lookup/techniques", async (_req, res) => {
  const rows = await db
    .select()
    .from(techniquesTable)
    .orderBy(techniquesTable.displayOrder);
  return res.json(rows);
});

router.get("/lookup/sizes", async (_req, res) => {
  const rows = await db
    .select()
    .from(sizesTable)
    .orderBy(sizesTable.displayOrder);
  return res.json(rows);
});

router.get("/lookup/tags", async (_req, res) => {
  const rows = await db.select().from(tagsTable).orderBy(tagsTable.name);
  return res.json(rows);
});

router.get("/lookup/storage-locations", async (_req, res) => {
  const rows = await db.select().from(storageLocationsTable).orderBy(storageLocationsTable.id);
  return res.json(rows);
});

export default router;
