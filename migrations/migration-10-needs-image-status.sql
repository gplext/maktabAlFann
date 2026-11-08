-- ============================================================================
-- Migration 10 — "needs_image" artwork status
--   Admin → Artworks → Duplicates hides artworks that reuse another artwork's
--   picture with status 'needs_image' until a new picture is uploaded.
--   (The API also applies this automatically the first time it hides copies.)
-- Safe to run more than once:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/migration-10-needs-image-status.sql
-- ============================================================================
BEGIN;
ALTER TABLE artworks DROP CONSTRAINT IF EXISTS artworks_status_check;
ALTER TABLE artworks ADD CONSTRAINT artworks_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'needs_image'));
COMMIT;
