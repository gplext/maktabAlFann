-- ============================================================================
-- Maktaba Al-Fann — Migration 01: referential integrity, indexes, constraints
-- ============================================================================
--
--  READ THIS BEFORE RUNNING.
--
--  Section 0 requires a decision from you. Everything after it is mechanical.
--
--  This script runs inside a single transaction. If anything fails, nothing is
--  applied. Take a backup first anyway:
--
--      pg_dump "$DATABASE_URL" --format=plain --no-owner --no-acl \
--        --file=backup-before-migration-01.sql
--
--  Then run:
--
--      psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f migration-01-integrity.sql
--
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- SECTION 0 — Repair orphaned rows  ** YOUR DECISION REQUIRED **
-- ---------------------------------------------------------------------------
-- Five artworks point at artist IDs that no longer exist. Because every public
-- listing endpoint INNER JOINs artists, these artworks are currently invisible
-- on the site:
--
--   artwork 13  "Oil Painting expression of The plains of scotland"  -> artist 7  (gone)
--   artwork 14  "Reflections on Golden city of Beijing"              -> artist 7  (gone)
--   artwork 85  "makatba all fann"                                   -> artist 42 (gone)
--   artwork 86  "cheema"                                             -> artist 42 (gone)
--   artwork 87  "The road in kashmir"                                -> artist 42 (gone)
--
-- Artworks 85/86/87 were submitted by clerk user user_3EULXP8QaM8QcZ4Vm96k7o5pqdj
-- (ahmadazmat46@gmail.com). Artist 45 "Ahmad Azmat" and artist 46 "Saad gull"
-- are the likely intended owners.
--
-- Run this first to see exactly what you are deciding about:

SELECT a.id, a.title, a.artist_id, a.submitted_by_clerk_id, a.status
FROM   artworks a
LEFT   JOIN artists ar ON ar.id = a.artist_id
WHERE  ar.id IS NULL
ORDER  BY a.id;

-- ---- CHOOSE ONE ----------------------------------------------------------
--
-- OPTION A — reassign to an existing artist (recommended; edit the IDs):
--
UPDATE artworks SET artist_id = 45 WHERE id IN (85, 86, 87);
UPDATE artworks SET artist_id = 19 WHERE id IN (13, 14);
--
-- OPTION B — park them as unapproved so they stop being half-live, then
--            reassign them one by one through the admin console:
--
--   UPDATE artworks SET status = 'rejected'
--   WHERE  artist_id NOT IN (SELECT id FROM artists);
--
-- OPTION C — delete them (destructive; tags and cart rows go too):
--
--   DELETE FROM artwork_tags WHERE artwork_id IN (
--     SELECT id FROM artworks WHERE artist_id NOT IN (SELECT id FROM artists));
--   DELETE FROM cart_items   WHERE artwork_id IN (
--     SELECT id FROM artworks WHERE artist_id NOT IN (SELECT id FROM artists));
--   DELETE FROM artworks     WHERE artist_id NOT IN (SELECT id FROM artists);
--
-- Uncomment your choice above, then continue.
-- ---------------------------------------------------------------------------

-- Cart rows pointing at artworks that no longer exist (currently: 1 row,
-- session 4oq6ko9mtbbmptn18ig -> artwork 82). Safe to remove unconditionally.
DELETE FROM cart_items
WHERE  artwork_id NOT IN (SELECT id FROM artworks);

-- Same for tag links and suppliers attached to deleted artworks.
DELETE FROM artwork_tags WHERE artwork_id NOT IN (SELECT id FROM artworks);
DELETE FROM artwork_tags WHERE tag_id     NOT IN (SELECT id FROM tags);
DELETE FROM suppliers    WHERE artwork_id NOT IN (SELECT id FROM artworks);

-- Duplicate (session_id, artwork_id) pairs would break the unique constraint
-- added in Section 2. Keep the oldest row of each pair and drop the rest.
DELETE FROM cart_items c
USING  cart_items keep
WHERE  c.session_id = keep.session_id
  AND  c.artwork_id = keep.artwork_id
  AND  c.id > keep.id;

-- Guard: refuse to continue if orphaned artworks remain, because the foreign
-- key added in Section 1 would fail anyway and the error would be less clear.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
  FROM   artworks a LEFT JOIN artists ar ON ar.id = a.artist_id
  WHERE  ar.id IS NULL;

  IF n > 0 THEN
    RAISE EXCEPTION
      'Migration stopped: % artwork(s) still reference a missing artist. Complete SECTION 0 above first.', n;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- SECTION 1 — Missing foreign keys
-- ---------------------------------------------------------------------------
-- The database currently enforces only 4 relationships. These are the rest.
--
-- Delete rules chosen deliberately:
--   RESTRICT  — you must not be able to delete an artist who still has art.
--   CASCADE   — link rows and cart rows have no meaning without their parent.
--   SET NULL  — order line items must survive the deletion of a catalogue item,
--               because an order is a historical record of what was sold.

ALTER TABLE artworks
  ADD CONSTRAINT artworks_artist_id_fk
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE RESTRICT;

ALTER TABLE artworks
  ADD CONSTRAINT artworks_art_subcategory_id_fk
  FOREIGN KEY (art_subcategory_id) REFERENCES art_subcategories(id) ON DELETE SET NULL;

ALTER TABLE art_subcategories
  ADD CONSTRAINT art_subcategories_art_category_id_fk
  FOREIGN KEY (art_category_id) REFERENCES art_categories(id) ON DELETE CASCADE;

ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_artwork_id_fk
  FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE;

ALTER TABLE artwork_tags
  ADD CONSTRAINT artwork_tags_artwork_id_fk
  FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE;

ALTER TABLE artwork_tags
  ADD CONSTRAINT artwork_tags_tag_id_fk
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;

ALTER TABLE suppliers
  ADD CONSTRAINT suppliers_artwork_id_fk
  FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE;

ALTER TABLE suppliers
  ADD CONSTRAINT suppliers_storage_location_id_fk
  FOREIGN KEY (storage_location_id) REFERENCES storage_locations(id) ON DELETE RESTRICT;

ALTER TABLE order_line_items
  ADD CONSTRAINT order_line_items_order_id_fk
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE order_line_items
  ADD CONSTRAINT order_line_items_artwork_id_fk
  FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE SET NULL;

ALTER TABLE order_line_items
  ADD CONSTRAINT order_line_items_shop_item_id_fk
  FOREIGN KEY (shop_item_id) REFERENCES shop_items(id) ON DELETE SET NULL;

ALTER TABLE gallery_commission
  ADD CONSTRAINT gallery_commission_artwork_id_fk
  FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE RESTRICT;

ALTER TABLE gallery_commission
  ADD CONSTRAINT gallery_commission_artist_id_fk
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE RESTRICT;

ALTER TABLE subcategory_compatibility
  ADD CONSTRAINT subcat_compat_art_category_id_fk
  FOREIGN KEY (art_category_id) REFERENCES art_categories(id) ON DELETE CASCADE;

ALTER TABLE subcategory_compatibility
  ADD CONSTRAINT subcat_compat_art_subcategory_id_fk
  FOREIGN KEY (art_subcategory_id) REFERENCES art_subcategories(id) ON DELETE CASCADE;

ALTER TABLE subcategory_compatibility
  ADD CONSTRAINT subcat_compat_shop_item_type_id_fk
  FOREIGN KEY (shop_item_type_id) REFERENCES shop_item_types(id) ON DELETE CASCADE;

-- Prevent duplicate compatibility rules.
ALTER TABLE subcategory_compatibility
  ADD CONSTRAINT subcat_compat_uniq
  UNIQUE (art_category_id, art_subcategory_id, shop_item_type_id);

-- ---------------------------------------------------------------------------
-- SECTION 2 — Uniqueness
-- ---------------------------------------------------------------------------
-- galleries.clerk_user_id is already UNIQUE. artists.clerk_user_id is not,
-- which is how one Clerk account ends up owning two artist records — the exact
-- situation artist_merge_requests exists to clean up after.
--
-- NULL is allowed and repeatable, so unclaimed artist records are unaffected.

ALTER TABLE artists
  ADD CONSTRAINT artists_clerk_user_id_uniq UNIQUE (clerk_user_id);

-- One cart may only hold a given artwork once (the API already checks this in
-- application code; this makes it true).
ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_session_artwork_uniq UNIQUE (session_id, artwork_id);

-- ---------------------------------------------------------------------------
-- SECTION 3 — Indexes
-- ---------------------------------------------------------------------------
-- The database currently has no index other than primary keys and uniques.
-- These cover every column the API joins or filters on.

CREATE INDEX IF NOT EXISTS idx_artworks_artist_id       ON artworks (artist_id);
CREATE INDEX IF NOT EXISTS idx_artworks_status          ON artworks (status);
CREATE INDEX IF NOT EXISTS idx_artworks_featured        ON artworks (is_featured) WHERE is_featured;
CREATE INDEX IF NOT EXISTS idx_artworks_art_category    ON artworks (art_category);
CREATE INDEX IF NOT EXISTS idx_artworks_art_type        ON artworks (art_type);
CREATE INDEX IF NOT EXISTS idx_artworks_submitted_by    ON artworks (submitted_by_clerk_id);

CREATE INDEX IF NOT EXISTS idx_artists_clerk_user_id    ON artists (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_artists_is_verified      ON artists (is_verified);
CREATE INDEX IF NOT EXISTS idx_artists_country          ON artists (country);

CREATE INDEX IF NOT EXISTS idx_cart_items_session       ON cart_items (session_id);

CREATE INDEX IF NOT EXISTS idx_orders_session           ON orders (session_id);
CREATE INDEX IF NOT EXISTS idx_orders_clerk_user_id     ON orders (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status            ON orders (status);
CREATE INDEX IF NOT EXISTS idx_order_line_items_order   ON order_line_items (order_id);

CREATE INDEX IF NOT EXISTS idx_artwork_tags_tag_id      ON artwork_tags (tag_id);

CREATE INDEX IF NOT EXISTS idx_enquiries_clerk_user_id  ON enquiries (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_status         ON enquiries (status);

CREATE INDEX IF NOT EXISTS idx_gallery_artists_artist   ON gallery_artists (artist_id);
CREATE INDEX IF NOT EXISTS idx_gallery_artworks_artwork ON gallery_artworks (artwork_id);

CREATE INDEX IF NOT EXISTS idx_artist_claims_artist     ON artist_claims (artist_id);
CREATE INDEX IF NOT EXISTS idx_artist_claims_clerk      ON artist_claims (clerk_user_id);

-- Case-insensitive artist name search (routes/artists.ts uses ILIKE '%…%').
-- Needs pg_trgm; skipped silently if the extension is unavailable.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS idx_artists_name_trgm
    ON artists USING gin (name gin_trgm_ops);
EXCEPTION WHEN insufficient_privilege OR undefined_file THEN
  RAISE NOTICE 'pg_trgm unavailable — skipped trigram index on artists.name';
END $$;

-- ---------------------------------------------------------------------------
-- SECTION 4 — Status value constraints
-- ---------------------------------------------------------------------------
-- These columns are free text today. A typo in one route ("aproved") hides a
-- record permanently with no error. The allowed values below are taken from the
-- comments already in lib/db/src/schema/ and from the routes that write them.
--
-- Existing rows are normalised first so the constraints can be applied.

UPDATE artworks   SET status      = lower(trim(status))      WHERE status      <> lower(trim(status));
UPDATE artists    SET is_verified = lower(trim(is_verified)) WHERE is_verified <> lower(trim(is_verified));
UPDATE galleries  SET status      = lower(trim(status))      WHERE status      <> lower(trim(status));
UPDATE orders     SET status      = lower(trim(status))      WHERE status      <> lower(trim(status));
UPDATE enquiries  SET status      = lower(trim(status))      WHERE status      <> lower(trim(status));

ALTER TABLE artworks ADD CONSTRAINT artworks_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

ALTER TABLE artists ADD CONSTRAINT artists_is_verified_check
  CHECK (is_verified IN ('pending', 'approved', 'rejected'));

ALTER TABLE galleries ADD CONSTRAINT galleries_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending_purchase', 'paid', 'shipped', 'delivered', 'cancelled'));

ALTER TABLE enquiries ADD CONSTRAINT enquiries_status_check
  CHECK (status IN ('pending', 'contacted', 'completed'));

ALTER TABLE artist_claims ADD CONSTRAINT artist_claims_status_check
  CHECK (status IN ('pending', 'auto_verified', 'approved', 'rejected'));

ALTER TABLE artist_merge_requests ADD CONSTRAINT artist_merge_requests_status_check
  CHECK (status IN ('pending', 'reviewed', 'approved', 'rejected', 'completed'));

ALTER TABLE gallery_commission ADD CONSTRAINT gallery_commission_status_check
  CHECK (status IN ('pending', 'paid', 'cancelled'));

ALTER TABLE shop_items ADD CONSTRAINT shop_items_status_check
  CHECK (status IN ('active', 'inactive'));

-- ---------------------------------------------------------------------------
-- SECTION 4b — Pre-flight checks for the constraints added in Section 5
-- ---------------------------------------------------------------------------
-- Adding a CHECK constraint to a table that already violates it fails with a
-- message that names the constraint but not the offending row. These blocks
-- fail first, with the row IDs, so you know exactly what to fix.
--
-- On the data in maktaba-alfann-db.sql as reviewed, all of these pass.

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(id::text, ', ' ORDER BY id) INTO bad
  FROM   order_line_items
  WHERE  num_nonnulls(artwork_id, shop_item_id) <> 1;

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION
      'order_line_items row(s) % have neither or both of artwork_id / shop_item_id. Each line must point at exactly one. Fix or delete them, then re-run.', bad;
  END IF;
END $$;

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(id::text, ', ' ORDER BY id) INTO bad
  FROM   order_line_items WHERE quantity <= 0 OR unit_price < 0;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'order_line_items row(s) % have a non-positive quantity or negative price.', bad;
  END IF;

  SELECT string_agg(id::text, ', ' ORDER BY id) INTO bad
  FROM   orders WHERE total_amount < 0;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'orders row(s) % have a negative total_amount.', bad;
  END IF;

  SELECT string_agg(id::text, ', ' ORDER BY id) INTO bad
  FROM   artists WHERE default_commission_rate NOT BETWEEN 0 AND 100;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'artists row(s) % have a commission rate outside 0-100.', bad;
  END IF;

  SELECT string_agg(id::text, ', ' ORDER BY id) INTO bad
  FROM   shop_items WHERE stock < 0;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'shop_items row(s) % have negative stock.', bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- SECTION 5 — Sanity constraints
-- ---------------------------------------------------------------------------

-- An order line is either an artwork or a shop item — never both, never neither.
ALTER TABLE order_line_items ADD CONSTRAINT order_line_items_one_target_check
  CHECK (num_nonnulls(artwork_id, shop_item_id) = 1);

ALTER TABLE order_line_items ADD CONSTRAINT order_line_items_quantity_check
  CHECK (quantity > 0);

ALTER TABLE order_line_items ADD CONSTRAINT order_line_items_unit_price_check
  CHECK (unit_price >= 0);

ALTER TABLE orders ADD CONSTRAINT orders_total_amount_check
  CHECK (total_amount >= 0);

ALTER TABLE shop_items ADD CONSTRAINT shop_items_stock_check
  CHECK (stock >= 0);

ALTER TABLE artists ADD CONSTRAINT artists_commission_rate_check
  CHECK (default_commission_rate BETWEEN 0 AND 100);

ALTER TABLE gallery_commission ADD CONSTRAINT gallery_commission_rate_check
  CHECK (commission_rate BETWEEN 0 AND 100);

-- gallery_about is a settings singleton — stop a second row appearing.
DELETE FROM gallery_about WHERE id <> (SELECT min(id) FROM gallery_about);
ALTER TABLE gallery_about ADD CONSTRAINT gallery_about_singleton_check CHECK (id = 1);

-- ---------------------------------------------------------------------------
-- SECTION 6 — updated_at columns
-- ---------------------------------------------------------------------------
-- You currently cannot tell when an artwork, artist or gallery last changed.

ALTER TABLE artworks  ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();
ALTER TABLE artists   ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_artworks_updated_at  ON artworks;
DROP TRIGGER IF EXISTS trg_artists_updated_at   ON artists;
DROP TRIGGER IF EXISTS trg_galleries_updated_at ON galleries;

CREATE TRIGGER trg_artworks_updated_at  BEFORE UPDATE ON artworks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_artists_updated_at   BEFORE UPDATE ON artists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_galleries_updated_at BEFORE UPDATE ON galleries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- SECTION 7 — Sequence repair
-- ---------------------------------------------------------------------------
-- storage_locations_id_seq is at 528 with 6 rows; gallery_commission_id_seq is
-- at 11 with 0 rows. Harmless, but it makes IDs confusing to read.

SELECT setval('storage_locations_id_seq',
              COALESCE((SELECT max(id) FROM storage_locations), 1), true);
SELECT setval('gallery_commission_id_seq',
              COALESCE((SELECT max(id) FROM gallery_commission), 1), true);

COMMIT;

-- ============================================================================
-- After running, refresh planner statistics:
--
--     ANALYZE;
--
-- Then verify nothing is orphaned:
--
--     SELECT 'artworks->artists' AS rel, count(*) FROM artworks a
--       LEFT JOIN artists ar ON ar.id = a.artist_id WHERE ar.id IS NULL
--     UNION ALL
--     SELECT 'cart->artworks', count(*) FROM cart_items c
--       LEFT JOIN artworks a ON a.id = c.artwork_id WHERE a.id IS NULL
--     UNION ALL
--     SELECT 'line_items->orders', count(*) FROM order_line_items l
--       LEFT JOIN orders o ON o.id = l.order_id WHERE o.id IS NULL;
--
-- All three should return 0.
--
-- IMPORTANT: after this migration, update lib/db/src/schema/ to match, or the
-- next `pnpm --filter @workspace/db run push` will try to remove these
-- constraints again. Drizzle's push reconciles the database to the TypeScript
-- schema — the TypeScript schema must become the source of truth.
-- ============================================================================
