-- ============================================================================
-- Migration 09 — Admin-managed carousels
--   One row per carousel on the site (home hero, artists page). Until a row is
--   saved from Admin → Carousels, the site keeps its built-in behaviour.
-- Additive only. Safe to run more than once:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/migration-09-carousels.sql
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS site_carousels (
  key         text PRIMARY KEY,
  mode        text    NOT NULL DEFAULT 'latest'
              CHECK (mode IN ('manual', 'latest', 'gallery', 'popularity')),
  gallery_id  integer REFERENCES galleries(id) ON DELETE SET NULL,
  pool_size   integer NOT NULL DEFAULT 15 CHECK (pool_size BETWEEN 1 AND 100),
  show_count  integer NOT NULL DEFAULT 10 CHECK (show_count BETWEEN 1 AND 50),
  pool        jsonb   NOT NULL DEFAULT '[]'::jsonb,
  items       jsonb   NOT NULL DEFAULT '[]'::jsonb,
  updated_at  timestamp NOT NULL DEFAULT now()
);

COMMIT;
