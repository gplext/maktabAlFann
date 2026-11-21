import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/** An artist's level, chosen when they register; filters the /artists page. */
export const ARTIST_LEVELS = ["master", "emerging", "student"] as const;
export type ArtistLevel = (typeof ARTIST_LEVELS)[number];
export const LEVEL_LABELS: Record<ArtistLevel, string> = { master: "Masters", emerging: "Emerging", student: "Students" };

/** A valid level from user input, or the fallback. */
export function parseLevel(v: unknown, fallback: ArtistLevel = "emerging"): ArtistLevel {
  return (ARTIST_LEVELS as readonly string[]).includes(String(v)) ? (v as ArtistLevel) : fallback;
}

/**
 * Same change as migrations/migration-11-artist-level.sql, applied once at start-up
 * so the site works even where that migration wasn't run.
 */
export function ensureArtistLevelColumn(): Promise<unknown> {
  return db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE artists ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'emerging';
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artists_level_check') THEN
        ALTER TABLE artists ADD CONSTRAINT artists_level_check CHECK (level IN ('master', 'emerging', 'student'));
      END IF;
    END $$`);
}
