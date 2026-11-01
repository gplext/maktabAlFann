-- ============================================================================
-- Migration 08 — rename the old Clerk-era account columns
--   clerk_user_id         → user_id            (orders, users, artists, galleries,
--                                               artist_claims, enquiries)
--   submitted_by_clerk_id → submitted_by_user_id (artworks)
-- The values were already this app's own account ids ("u_…"); only the names change.
-- Indexes and constraints with "clerk" in their name are renamed too.
-- Safe to run more than once.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/migration-08-user-id-columns.sql
-- ============================================================================
BEGIN;

DO $$
DECLARE
  t text;
  r record;
BEGIN
  FOREACH t IN ARRAY ARRAY['orders', 'users', 'artists', 'galleries', 'artist_claims', 'enquiries'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'clerk_user_id')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id') THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN clerk_user_id TO user_id', t);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'artworks' AND column_name = 'submitted_by_clerk_id') THEN
    ALTER TABLE artworks RENAME COLUMN submitted_by_clerk_id TO submitted_by_user_id;
  END IF;

  FOR r IN SELECT c.conname, c.conrelid::regclass AS tbl FROM pg_constraint c
           JOIN pg_namespace n ON n.oid = c.connamespace
           WHERE n.nspname = 'public' AND c.conname LIKE '%clerk%' LOOP
    EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', r.tbl, r.conname,
                   replace(replace(r.conname, 'clerk_user_id', 'user_id'), 'clerk', 'user'));
  END LOOP;

  FOR r IN SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE '%clerk%' LOOP
    EXECUTE format('ALTER INDEX %I RENAME TO %I', r.indexname,
                   replace(replace(r.indexname, 'clerk_user_id', 'user_id'), 'clerk', 'user'));
  END LOOP;
END $$;

COMMIT;
