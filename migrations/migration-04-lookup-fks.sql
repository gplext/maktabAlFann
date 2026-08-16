-- ============================================================================
-- Maktaba Al-Fann — Migration 04: make the lookup tables real
-- ============================================================================
--
--  WHAT THIS FIXES
--
--  You built art_categories, art_styles, sizes and techniques as proper
--  reference tables, then stored free text in `artworks` anyway. The result:
--
--    artworks.art_category  holds  'Handicraft', 'AI Art', 'Sculpture Work',
--                                  'painting', '' and NULL — none of which
--                                  exist in art_categories. THIS IS WHY YOUR
--                                  CATEGORY FILTER RETURNS NOTHING.
--
--    artworks.art_type      holds a mix of media ('waterpaint', 'oil painting')
--                                  and styles ('Realism', 'Folk Art') — because
--                                  the artist portal's "Art Style" dropdown was
--                                  wired to art_type by mistake.
--
--    artworks.art_style     is empty on all 86 rows — the column the portal
--                                  should have been writing to.
--
--    artworks.size          holds '24" x 36"', 'M', 'Medium' and '' side by side.
--
--  AFTER THIS MIGRATION
--
--    art_category_id -> art_categories(id)
--    art_style_id    -> art_styles(id)        (replaces BOTH art_type and art_style)
--    size_id         -> sizes(id)
--    technique_id    -> techniques(id)
--
--  `medium` stays free text on purpose — it holds descriptive prose
--  ("Watercolor and gold leaf on paper") that no lookup list can express, and
--  it is shown verbatim on the artwork page. `theme` stays free text likewise.
--
--  NOTHING IS LOST. Every old text value is copied to
--  `artworks_lookup_migration_audit` before the columns are dropped, so you can
--  see exactly what each artwork used to say and correct any mapping later.
--
--  RUN ORDER: after migration-02. Independent of migration-03.
--
--      pg_dump "$DATABASE_URL" --format=plain --no-owner --no-acl \
--        --file=backup-before-migration-04.sql
--
--      psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f migration-04-lookup-fks.sql
--
--  ⚠ CODE MUST SHIP WITH THIS. The API routes select art_type / art_category /
--    size / technique by name today. After this migration those columns do not
--    exist. Deploy the updated api-server and frontend together.
--
--  ✎ EDIT THE MAPPINGS IN SECTION 1 BEFORE RUNNING. They are ordinary INSERTs
--    into a temporary table — change any row you disagree with.
--
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Make sure the lookup tables are populated
-- ---------------------------------------------------------------------------
-- routes/lookup.ts seeds these on boot, but only when a table is completely
-- empty. Re-seeding here makes the migration self-contained.

INSERT INTO art_categories (name, display_order) VALUES
  ('Paintings',0),('Sculptures',1),('Drawings',2),
  ('Printmaking',3),('Photography',4),('AI Assisted',5)
ON CONFLICT (name) DO NOTHING;

INSERT INTO art_styles (name, display_order) VALUES
  ('Impressionism',0),('Cubism',1),('Realism',2),('Abstract',3),
  ('Expressionism',4),('Surrealism',5),('Minimalism',6),('Contemporary',7),
  ('Mughal Miniature',8),('Folk Art',9)
ON CONFLICT (name) DO NOTHING;

INSERT INTO techniques (name, display_order) VALUES
  ('Thick Impasto',0),('Brushwork',1),('Wash',2),('Cross-hatching',3),
  ('Stippling',4),('Glazing',5),('Dry Brush',6),('Pointillism',7)
ON CONFLICT (name) DO NOTHING;

INSERT INTO sizes (code, label, description, display_order) VALUES
  ('LL','Extra Large','Above 120 cm',0),
  ('L','Large','80-120 cm',1),
  ('M','Medium','50-80 cm',2),
  ('MS','Medium Small','30-50 cm',3),
  ('S','Small','Below 30 cm',4)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1. The mappings  ✎ EDIT THESE
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE map_category (old_value text PRIMARY KEY, new_name text) ON COMMIT DROP;

INSERT INTO map_category (old_value, new_name) VALUES
  ('handicraft',      'Paintings'),    -- 20 artworks; all are paintings by medium
  ('ai art',          'AI Assisted'),  -- 12 artworks
  ('sculpture work',  'Sculptures'),   --  9 artworks
  ('paintings',       'Paintings'),
  ('painting',        'Paintings'),
  ('printmaking',     'Printmaking'),
  ('drawings',        'Drawings'),
  ('photography',     'Photography'),
  ('ai assisted',     'AI Assisted'),
  ('sculptures',      'Sculptures'),
  -- singular forms, so the art_type fallback in section 4a can also match:
  -- artwork 88 "Theme park" has art_type='Sculpture' and no category at all.
  ('sculpture',       'Sculptures'),
  ('drawing',         'Drawings'),
  ('print',           'Printmaking'),
  ('photograph',      'Photography');

CREATE TEMP TABLE map_style (old_value text PRIMARY KEY, new_name text) ON COMMIT DROP;

-- Left column = every distinct value currently in artworks.art_type, lowercased.
-- NULL on the right means "leave the style unset".
INSERT INTO map_style (old_value, new_name) VALUES
  -- values the artist portal wrote (these were already style names)
  ('realism',              'Realism'),
  ('folk art',             'Folk Art'),
  ('contemporary',         'Contemporary'),
  ('impressionism',        'Impressionism'),
  ('cubism',               'Cubism'),
  ('abstract',             'Abstract'),
  ('expressionism',        'Expressionism'),
  ('surrealism',           'Surrealism'),
  ('minimalism',           'Minimalism'),
  ('mughal miniature',     'Mughal Miniature'),
  -- values the original seed script wrote
  ('classic',              'Realism'),
  ('modern',               'Contemporary'),
  ('modern-culture',       'Contemporary'),
  ('historic-culture',     'Folk Art'),
  ('gothic',               'Expressionism'),
  ('splatter',             'Abstract'),
  ('sketch with 2 colors', 'Minimalism'),
  -- these three name a MEDIUM, not a style. The medium is already recorded in
  -- artworks.medium, so the style here is a best guess — edit if you disagree.
  ('oil painting',         'Realism'),
  ('waterpaint',           'Impressionism'),
  ('acrylic',              'Contemporary'),
  -- these two name a CATEGORY, not a style. Handled in section 2 as a category
  -- hint; the style is genuinely unknown, so it stays NULL.
  ('sculpture',            NULL),
  ('painting',             NULL);

CREATE TEMP TABLE map_size (old_value text PRIMARY KEY, new_code text) ON COMMIT DROP;

INSERT INTO map_size (old_value, new_code) VALUES
  ('ll','LL'), ('l','L'), ('m','M'), ('ms','MS'), ('s','S'),
  ('extra large','LL'), ('large','L'), ('medium','M'),
  ('medium small','MS'), ('small','S');

-- ---------------------------------------------------------------------------
-- 2. Archive every old value before touching anything
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS artworks_lookup_migration_audit;

CREATE TABLE artworks_lookup_migration_audit AS
SELECT id            AS artwork_id,
       title,
       art_category  AS old_art_category,
       art_type      AS old_art_type,
       art_style     AS old_art_style,
       size          AS old_size,
       technique     AS old_technique,
       dimensions    AS old_dimensions,
       medium        AS old_medium,
       now()         AS archived_at
FROM   artworks;

ALTER TABLE artworks_lookup_migration_audit ADD PRIMARY KEY (artwork_id);

COMMENT ON TABLE artworks_lookup_migration_audit IS
  'Free-text lookup values as they stood before migration-04. Keep until the new category/style/size/technique assignments have been reviewed in the admin console, then drop.';

-- The seed artworks duplicated their size string into `dimensions`. Where
-- `dimensions` is empty but `size` held a real measurement (e.g. '24" x 36"'),
-- move it across so the artwork page and the 3D frame viewer keep their aspect
-- ratio after `size` becomes a code.
UPDATE artworks
SET    dimensions = size
WHERE  coalesce(trim(dimensions), '') = ''
  AND  size ~ '[0-9]';

-- ---------------------------------------------------------------------------
-- 3. Add the new columns
-- ---------------------------------------------------------------------------

ALTER TABLE artworks
  ADD COLUMN IF NOT EXISTS art_category_id integer,
  ADD COLUMN IF NOT EXISTS art_style_id    integer,
  ADD COLUMN IF NOT EXISTS size_id         integer,
  ADD COLUMN IF NOT EXISTS technique_id    integer;

-- ---------------------------------------------------------------------------
-- 4. Backfill
-- ---------------------------------------------------------------------------

-- 4a. Category — from art_category, falling back to a hint in art_type
--     ('Sculpture' / 'Painting' were entered there), then to Paintings, which
--     is what the remaining rows are by medium.
UPDATE artworks a
SET    art_category_id = c.id
FROM   art_categories c
WHERE  c.name = COALESCE(
         (SELECT m.new_name FROM map_category m
           WHERE m.old_value = lower(trim(a.art_category))),
         (SELECT m.new_name FROM map_category m
           WHERE m.old_value = lower(trim(a.art_type))),
         'Paintings');

-- 4b. Style — from art_type (what the portal actually wrote), falling back to
--     the art_style column on the chance anything ever landed there.
UPDATE artworks a
SET    art_style_id = s.id
FROM   art_styles s
WHERE  s.name = COALESCE(
         (SELECT m.new_name FROM map_style m
           WHERE m.old_value = lower(trim(a.art_type))),
         (SELECT m.new_name FROM map_style m
           WHERE m.old_value = lower(trim(a.art_style))));

-- 4c. Size — an explicit code first, then a measurement in inches or cm
--     converted to the right bucket by its longest side.
WITH measured AS (
  SELECT a.id,
         CASE
           WHEN a.size ILIKE '%cm%' THEN 1.0
           ELSE 2.54                                   -- bare numbers are inches
         END AS to_cm,
         (regexp_match(a.size, '([0-9]+(?:\.[0-9]+)?)\D+([0-9]+(?:\.[0-9]+)?)'))[1]::numeric AS d1,
         (regexp_match(a.size, '([0-9]+(?:\.[0-9]+)?)\D+([0-9]+(?:\.[0-9]+)?)'))[2]::numeric AS d2
  FROM   artworks a
  WHERE  a.size ~ '[0-9]+\D+[0-9]+'
),
bucketed AS (
  SELECT id,
         CASE
           WHEN greatest(d1, d2) * to_cm > 120 THEN 'LL'
           WHEN greatest(d1, d2) * to_cm >= 80 THEN 'L'
           WHEN greatest(d1, d2) * to_cm >= 50 THEN 'M'
           WHEN greatest(d1, d2) * to_cm >= 30 THEN 'MS'
           ELSE 'S'
         END AS code
  FROM   measured
)
UPDATE artworks a
SET    size_id = z.id
FROM   sizes z
WHERE  z.code = COALESCE(
         (SELECT m.new_code FROM map_size m WHERE m.old_value = lower(trim(a.size))),
         (SELECT b.code     FROM bucketed b WHERE b.id = a.id));

-- Where size was blank but width/height are recorded, derive the bucket from them.
UPDATE artworks a
SET    size_id = z.id
FROM   sizes z
WHERE  a.size_id IS NULL
  AND  a.width_cm IS NOT NULL AND a.height_cm IS NOT NULL
  AND  greatest(a.width_cm, a.height_cm) > 0
  AND  z.code = CASE
         WHEN greatest(a.width_cm, a.height_cm) > 120 THEN 'LL'
         WHEN greatest(a.width_cm, a.height_cm) >= 80 THEN 'L'
         WHEN greatest(a.width_cm, a.height_cm) >= 50 THEN 'M'
         WHEN greatest(a.width_cm, a.height_cm) >= 30 THEN 'MS'
         ELSE 'S'
       END;

-- 4d. Technique — exact name match, case-insensitive.
UPDATE artworks a
SET    technique_id = t.id
FROM   techniques t
WHERE  lower(t.name) = lower(trim(a.technique));

-- ---------------------------------------------------------------------------
-- 5. Report what happened  — review this before committing
-- ---------------------------------------------------------------------------

SELECT 'category' AS field,
       COALESCE(aud.old_art_category, '(null)') AS was,
       c.name                                   AS now_is,
       count(*)                                 AS artworks
FROM   artworks a
JOIN   artworks_lookup_migration_audit aud ON aud.artwork_id = a.id
LEFT   JOIN art_categories c ON c.id = a.art_category_id
GROUP  BY 1,2,3
UNION ALL
SELECT 'style',
       COALESCE(NULLIF(aud.old_art_type,''), '(blank)'),
       COALESCE(s.name, '(unset)'),
       count(*)
FROM   artworks a
JOIN   artworks_lookup_migration_audit aud ON aud.artwork_id = a.id
LEFT   JOIN art_styles s ON s.id = a.art_style_id
GROUP  BY 1,2,3
UNION ALL
SELECT 'size',
       COALESCE(NULLIF(aud.old_size,''), '(blank)'),
       COALESCE(z.code, '(unset)'),
       count(*)
FROM   artworks a
JOIN   artworks_lookup_migration_audit aud ON aud.artwork_id = a.id
LEFT   JOIN sizes z ON z.id = a.size_id
GROUP  BY 1,2,3
ORDER  BY 1, 4 DESC, 2;

-- Anything that could not be mapped. Empty is ideal; rows here just mean the
-- artwork has no style/size set and an admin can pick one later.
SELECT a.id, a.title, aud.old_art_type, aud.old_size
FROM   artworks a
JOIN   artworks_lookup_migration_audit aud ON aud.artwork_id = a.id
WHERE  a.art_style_id IS NULL OR a.size_id IS NULL
ORDER  BY a.id;

-- ---------------------------------------------------------------------------
-- 6. Constrain, index, and drop the free-text columns
-- ---------------------------------------------------------------------------

ALTER TABLE artworks
  ADD CONSTRAINT artworks_art_category_id_fk
    FOREIGN KEY (art_category_id) REFERENCES art_categories(id) ON DELETE RESTRICT,
  ADD CONSTRAINT artworks_art_style_id_fk
    FOREIGN KEY (art_style_id) REFERENCES art_styles(id) ON DELETE SET NULL,
  ADD CONSTRAINT artworks_size_id_fk
    FOREIGN KEY (size_id) REFERENCES sizes(id) ON DELETE SET NULL,
  ADD CONSTRAINT artworks_technique_id_fk
    FOREIGN KEY (technique_id) REFERENCES techniques(id) ON DELETE SET NULL;

-- Every artwork must sit in a category — that is the whole point of the filter.
ALTER TABLE artworks ALTER COLUMN art_category_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_artworks_art_category_id ON artworks (art_category_id);
CREATE INDEX IF NOT EXISTS idx_artworks_art_style_id    ON artworks (art_style_id);
CREATE INDEX IF NOT EXISTS idx_artworks_size_id         ON artworks (size_id);
CREATE INDEX IF NOT EXISTS idx_artworks_technique_id    ON artworks (technique_id);

-- Indexes from migration-01 on the columns that are about to disappear.
DROP INDEX IF EXISTS idx_artworks_art_category;
DROP INDEX IF EXISTS idx_artworks_art_type;

ALTER TABLE artworks
  DROP COLUMN art_category,
  DROP COLUMN art_type,
  DROP COLUMN art_style,
  DROP COLUMN size,
  DROP COLUMN technique;

COMMENT ON COLUMN artworks.art_category_id IS
  'Required. References art_categories — the filter on /art depends on this.';
COMMENT ON COLUMN artworks.art_style_id IS
  'References art_styles. Replaces the old art_type column, which the artist portal was writing style names into by mistake.';
COMMENT ON COLUMN artworks.medium IS
  'Free text on purpose — descriptive prose such as "Watercolor and gold leaf on paper". The mediums lookup table is only a suggestion list in the portal form.';
COMMENT ON COLUMN artworks.dimensions IS
  'Free-text measurement, e.g. 24" x 36". Used for display and to derive the aspect ratio in the 3D frame viewer. size_id is the filterable bucket.';

-- ---------------------------------------------------------------------------
-- 7. Verify
-- ---------------------------------------------------------------------------

SELECT c.name AS category, count(a.id) AS artworks
FROM   art_categories c
LEFT   JOIN artworks a ON a.art_category_id = c.id
GROUP  BY c.name
ORDER  BY count(a.id) DESC;

SELECT count(*) FILTER (WHERE art_category_id IS NULL) AS missing_category,
       count(*) FILTER (WHERE art_style_id    IS NULL) AS missing_style,
       count(*) FILTER (WHERE size_id         IS NULL) AS missing_size,
       count(*) FILTER (WHERE technique_id    IS NULL) AS missing_technique
FROM   artworks;

COMMIT;

-- ============================================================================
-- AFTERWARDS
--
--  * Review artworks_lookup_migration_audit against the new assignments. Fix
--    anything wrong in the admin console, then:
--        DROP TABLE artworks_lookup_migration_audit;
--
--  * shop_items.compatible_art_categories is a JSON array of strings that
--    actually holds MEDIUM names ('Oil on Canvas', 'Watercolor'), so it never
--    matched a category even before this migration — routes/cart.ts works
--    around it by treating every item of type 'Frames' as universal. This
--    migration does not change that behaviour. Deleting the JSON column in
--    favour of the subcategory_compatibility table is a separate job.
--
--  * ROLLBACK: restore the pg_dump taken at the top of this file. The audit
--    table holds every old value, but re-creating the dropped columns by hand
--    is fiddly and the dump is exact.
-- ============================================================================
