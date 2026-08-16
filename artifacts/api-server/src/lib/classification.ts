import { eq } from "drizzle-orm";
import {
  db,
  artCategoriesTable,
  artStylesTable,
  artSubcategoriesTable,
  sizesTable,
  techniquesTable,
  toMoney,
} from "@workspace/db";

export type ClassificationInput = {
  artCategoryId?: number | null;
  artStyleId?: number | null;
  sizeId?: number | null;
  techniqueId?: number | null;
  artSubcategoryId?: number | null;
};

const LOOKUPS = [
  ["artCategoryId", artCategoriesTable],
  ["artStyleId", artStylesTable],
  ["sizeId", sizesTable],
  ["techniqueId", techniquesTable],
  ["artSubcategoryId", artSubcategoriesTable],
] as const;

/**
 * Confirm every lookup id the client sent actually exists.
 *
 * The foreign keys added in migration-04 would reject a bad id anyway, but a
 * constraint violation surfaces to the caller as a 500. This turns it into a
 * clear 400 naming the offending field.
 *
 * Returns an error message, or null when everything checks out.
 */
export async function validateClassification(
  input: ClassificationInput,
): Promise<string | null> {
  for (const [field, table] of LOOKUPS) {
    const value = input[field];
    if (value == null) continue;
    const [row] = await db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.id, value))
      .limit(1);
    if (!row) return `${field} ${value} does not exist`;
  }
  return null;
}

/**
 * The public price an artwork is listed at.
 *
 * `expectedPrice` is what the artist wants to receive; the gallery's cut is
 * added on top. This is the ONLY place a display price is produced — a client
 * never supplies one, so a browser cannot set its own price. Admins can
 * override the result afterwards via PATCH /admin/artworks/:id/price.
 */
export function deriveDisplayPrice(
  expectedPrice: number | null | undefined,
  commissionRatePercent: number | null | undefined,
): number | null {
  if (expectedPrice == null) return null;
  const rate = commissionRatePercent ?? 30;
  return toMoney(expectedPrice * (1 + rate / 100));
}
