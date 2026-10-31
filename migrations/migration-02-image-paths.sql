-- ============================================================================
-- Maktaba Al-Fann — Migration 02: repoint artwork images after de-duplication
-- ============================================================================
--
--  WHY: public/images/artworks/ contained 98 PNGs, of which 76 were byte-for-byte
--  duplicates of 13 originals. Every `copy_N_<name>.png` was an exact copy of
--  `<name>.png`. The duplicates have been moved to _to_delete/duplicate-images/,
--  taking the folder from 104 MB to 41 MB.
--
--  60 artwork rows still point at the removed `copy_N_` filenames. Until this
--  migration runs, those artworks render a broken image.
--
--  RUN THIS BEFORE you delete the _to_delete folder, so the change is
--  reversible either way.
--
--      pg_dump "$DATABASE_URL" --format=plain --no-owner --no-acl \
--        --file=backup-before-migration-02.sql
--
--      psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f migration-02-image-paths.sql
--
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Preview — what is about to change (60 rows expected)
-- ---------------------------------------------------------------------------

SELECT id,
       left(title, 45)                                          AS title,
       image_url                                                AS from_path,
       regexp_replace(image_url, '/copy_[0-9]+_', '/')           AS to_path
FROM   artworks
WHERE  image_url ~ '/copy_[0-9]+_'
ORDER  BY id;

-- ---------------------------------------------------------------------------
-- 2. Rewrite image_url and thumbnail_url
-- ---------------------------------------------------------------------------
-- Only paths matching /copy_<digits>_ are touched. Object-storage URLs
-- (/api/storage/objects/...) and every other path are left exactly as they are.

UPDATE artworks
SET    image_url     = regexp_replace(image_url,     '/copy_[0-9]+_', '/'),
       thumbnail_url = regexp_replace(thumbnail_url, '/copy_[0-9]+_', '/')
WHERE  image_url     ~ '/copy_[0-9]+_'
   OR  thumbnail_url ~ '/copy_[0-9]+_';

-- ---------------------------------------------------------------------------
-- 3. Order line items keep a frozen copy of the image at time of sale
-- ---------------------------------------------------------------------------
-- These are historical records, but a broken image in an order history is still
-- a broken image, and the replacement file is pixel-identical.

UPDATE order_line_items
SET    image_url = regexp_replace(image_url, '/copy_[0-9]+_', '/')
WHERE  image_url ~ '/copy_[0-9]+_';

-- ---------------------------------------------------------------------------
-- 4. Enquiries store their items as a JSON array — rewrite imageUrl in place
-- ---------------------------------------------------------------------------

UPDATE enquiries e
SET    items = rewritten.items
FROM (
  SELECT id,
         jsonb_agg(
           CASE
             WHEN item->>'imageUrl' ~ '/copy_[0-9]+_'
               THEN jsonb_set(item, '{imageUrl}',
                      to_jsonb(regexp_replace(item->>'imageUrl', '/copy_[0-9]+_', '/')))
             ELSE item
           END
           ORDER BY ord
         ) AS items
  FROM   enquiries, jsonb_array_elements(items) WITH ORDINALITY AS t(item, ord)
  WHERE  jsonb_typeof(items) = 'array'
  GROUP  BY id
) AS rewritten
WHERE  e.id = rewritten.id
  AND  e.items::text ~ '/copy_[0-9]+_';

-- ---------------------------------------------------------------------------
-- 5. Verify — all three should return 0
-- ---------------------------------------------------------------------------

SELECT 'artworks still pointing at copy_'        AS check, count(*) FROM artworks
  WHERE image_url ~ '/copy_[0-9]+_' OR thumbnail_url ~ '/copy_[0-9]+_'
UNION ALL
SELECT 'order_line_items still pointing at copy_', count(*) FROM order_line_items
  WHERE image_url ~ '/copy_[0-9]+_'
UNION ALL
SELECT 'enquiries still pointing at copy_',        count(*) FROM enquiries
  WHERE items::text ~ '/copy_[0-9]+_';

-- ---------------------------------------------------------------------------
-- 6. Sanity — every local image path should now be one of the 38 files on disk
-- ---------------------------------------------------------------------------
-- Cross-check this list against artifacts/art-gallery/public/images/artworks/.
-- Anything here that is not on disk is a broken image.

SELECT DISTINCT regexp_replace(image_url, '^.*/', '') AS filename
FROM   artworks
WHERE  image_url LIKE '/images/artworks/%'
ORDER  BY filename;

COMMIT;

-- ============================================================================
-- ROLLBACK
--
-- This migration is lossy in one direction: several artworks that pointed at
-- different copy_N_ files now point at the same file, so the original mapping
-- cannot be derived from the data afterwards. To undo, restore the dump you
-- took at the top of this file and move _to_delete/duplicate-images/ back to
-- artifacts/art-gallery/public/images/artworks/.
--
-- That is why you should not delete _to_delete/ until the site has been
-- verified with these paths in place.
-- ============================================================================
