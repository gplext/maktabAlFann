-- ============================================================================
--  migration-06-frames.sql — frames you can measure, check and draw in 3D
--
--  Adds:
--    • frame_profiles       mouldings: face width, depth, rebate, shadow gap, 3D look
--    • frame_compatibility  which art categories / supports a profile may be used with
--    • surface_finishes     varnish, resin… (glazing + 3D gloss)
--    • base_types           framing properties (rigid / flexible / loose sheet, needs glass…)
--    • shop_items           frame details: profile, opening size, glazing, mat, backing, per-metre price
--    • artworks             exact size in mm, surface finish, the included frame
--    • order_line_items     the frame's final size frozen on the order
--
--  Safe to run more than once. Run with:
--    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/migration-06-frames.sql
-- ============================================================================
BEGIN;

-- ── Surface finishes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS surface_finishes (
  id            serial PRIMARY KEY,
  name          text    NOT NULL UNIQUE,
  glazing_ok    boolean NOT NULL DEFAULT true,
  gloss         real    NOT NULL DEFAULT 0.3,
  display_order integer NOT NULL DEFAULT 0
);
INSERT INTO surface_finishes (name, glazing_ok, gloss, display_order) VALUES
  ('None (raw)',            true,  0.10, 0),
  ('Varnish — matte',       true,  0.15, 1),
  ('Varnish — satin',       true,  0.40, 2),
  ('Varnish — gloss',       true,  0.80, 3),
  ('UV-protective varnish', true,  0.40, 4),
  ('Wax',                   true,  0.30, 5),
  ('Resin coat',            false, 0.95, 6),
  ('Thick impasto (raised)',false, 0.35, 7)
ON CONFLICT (name) DO NOTHING;

-- ── Support base (canvas type) properties ───────────────────────────────────
ALTER TABLE base_types ADD COLUMN IF NOT EXISTS rigidity             text    NOT NULL DEFAULT 'rigid';
ALTER TABLE base_types ADD COLUMN IF NOT EXISTS needs_stretcher      boolean NOT NULL DEFAULT false;
ALTER TABLE base_types ADD COLUMN IF NOT EXISTS needs_glazing        boolean NOT NULL DEFAULT false;
ALTER TABLE base_types ADD COLUMN IF NOT EXISTS needs_backing        boolean NOT NULL DEFAULT false;
ALTER TABLE base_types ADD COLUMN IF NOT EXISTS typical_thickness_mm integer;
-- Add the standard supports, unless one with the same name (any capitalisation) already exists.
INSERT INTO base_types (name, display_order, rigidity, needs_stretcher, needs_glazing, needs_backing, typical_thickness_mm)
SELECT v.name, v.ord, v.rigidity, v.stretch, v.glaze, v.back, v.thick
FROM (VALUES
  ('Stretched canvas',     0, 'flexible',    false, false, false, 20),
  ('Gallery-wrap canvas',  1, 'flexible',    false, false, false, 38),
  ('Canvas board / panel', 2, 'rigid',       false, false, false, 4),
  ('Rolled canvas',        3, 'loose_sheet', true,  false, true,  1),
  ('Fabric',               4, 'flexible',    true,  false, true,  1),
  ('Paper',                5, 'loose_sheet', false, true,  true,  1),
  ('Wasli',                6, 'loose_sheet', false, true,  true,  1),
  ('Wood panel',           7, 'rigid',       false, false, false, 18),
  ('Hardboard / MDF',      8, 'rigid',       false, false, false, 6)
) AS v(name, ord, rigidity, stretch, glaze, back, thick)
WHERE NOT EXISTS (SELECT 1 FROM base_types b WHERE lower(b.name) = lower(v.name));
-- Sensible properties for supports that already existed (only where nothing was set yet).
UPDATE base_types SET rigidity='loose_sheet', needs_glazing=true, needs_backing=true, typical_thickness_mm=1
  WHERE name ~* '(paper|wasli)' AND typical_thickness_mm IS NULL;
UPDATE base_types SET rigidity='loose_sheet', needs_stretcher=true, needs_backing=true, typical_thickness_mm=1
  WHERE name ~* 'rolled' AND typical_thickness_mm IS NULL;
UPDATE base_types SET rigidity='flexible', needs_stretcher=true, needs_backing=true, typical_thickness_mm=1
  WHERE name ~* '(fabric|linen|silk|cloth)' AND typical_thickness_mm IS NULL;
UPDATE base_types SET rigidity='flexible', typical_thickness_mm=20
  WHERE name ~* 'canvas' AND name !~* '(board|panel|rolled)' AND typical_thickness_mm IS NULL;
UPDATE base_types SET rigidity='rigid', typical_thickness_mm=CASE WHEN name ~* '(board|panel|mdf)' THEN 6 WHEN name ~* 'wood' THEN 18 ELSE NULL END
  WHERE name ~* '(board|panel|mdf|wood)' AND typical_thickness_mm IS NULL;

-- ── Frame profiles (mouldings) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS frame_profiles (
  id                serial PRIMARY KEY,
  name              text    NOT NULL UNIQUE,
  style             text    NOT NULL DEFAULT 'standard',
  material          text    NOT NULL DEFAULT 'wood',
  profile_shape     text    NOT NULL DEFAULT 'flat',
  face_width_mm     integer NOT NULL,
  depth_mm          integer NOT NULL,
  rebate_width_mm   integer NOT NULL DEFAULT 5,
  rebate_depth_mm   integer NOT NULL,
  reveal_gap_mm     integer NOT NULL DEFAULT 0,
  reveal_colour_hex text    NOT NULL DEFAULT '#111111',
  max_long_edge_mm  integer,
  max_weight_g      integer,
  colour_hex        text    NOT NULL DEFAULT '#8B6914',
  metalness         real    NOT NULL DEFAULT 0.3,
  roughness         real    NOT NULL DEFAULT 0.5,
  texture_url       text,
  active            boolean NOT NULL DEFAULT true,
  display_order     integer NOT NULL DEFAULT 0
);
-- Starting set, matching the existing frame types. Edit the measurements in Admin → Frames.
INSERT INTO frame_profiles (name, style, material, profile_shape, face_width_mm, depth_mm, rebate_width_mm, rebate_depth_mm, reveal_gap_mm, max_long_edge_mm, colour_hex, metalness, roughness, display_order) VALUES
  ('Thin Outer Frame', 'thin',      'wood',  'flat',    15, 25, 5, 15, 0, 1000, '#1C1C1C', 0.10, 0.60, 0),
  ('Enclosing Frame',  'enclosing', 'wood',  'bevel',   35, 40, 6, 25, 0, 1500, '#5A3B1E', 0.10, 0.55, 1),
  ('Wide Frame',       'wide',      'wood',  'ornate',  70, 45, 8, 25, 0, 1800, '#8B6914', 0.55, 0.35, 2),
  ('Floater Frame',    'floater',   'wood',  'flat',    12, 50, 0, 45, 8, 1500, '#1C1C1C', 0.10, 0.60, 3)
ON CONFLICT (name) DO NOTHING;

-- ── Compatibility rules ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS frame_compatibility (
  id               serial PRIMARY KEY,
  frame_profile_id integer NOT NULL REFERENCES frame_profiles(id) ON DELETE CASCADE,
  art_category_id  integer REFERENCES art_categories(id) ON DELETE CASCADE,
  base_type_id     integer REFERENCES base_types(id) ON DELETE CASCADE,
  allow            boolean NOT NULL DEFAULT true
);
-- Sculptures are never framed.
INSERT INTO frame_compatibility (frame_profile_id, art_category_id, allow)
SELECT p.id, c.id, false FROM frame_profiles p CROSS JOIN art_categories c
WHERE c.name ~* 'sculpt'
  AND NOT EXISTS (SELECT 1 FROM frame_compatibility f WHERE f.frame_profile_id=p.id AND f.art_category_id=c.id);
-- Floaters show the edges: only for canvas and rigid panels, never loose paper.
INSERT INTO frame_compatibility (frame_profile_id, base_type_id, allow)
SELECT p.id, b.id, false FROM frame_profiles p CROSS JOIN base_types b
WHERE p.style='floater' AND b.rigidity='loose_sheet'
  AND NOT EXISTS (SELECT 1 FROM frame_compatibility f WHERE f.frame_profile_id=p.id AND f.base_type_id=b.id);

-- ── Frame products ─────────────────────────────────────────────────────────
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS frame_profile_id integer REFERENCES frame_profiles(id) ON DELETE SET NULL;
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS inner_width_mm   integer;
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS inner_height_mm  integer;
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS glazing          text NOT NULL DEFAULT 'none';
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS mat_width_mm     integer NOT NULL DEFAULT 0;
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS mat_colour_hex   text NOT NULL DEFAULT '#F5EDD8';
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS backing          text NOT NULL DEFAULT 'none';
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS reveal_gap_mm    integer;
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS price_per_metre  numeric(12,2);

-- ── Artworks ───────────────────────────────────────────────────────────────
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS width_mm           integer;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS height_mm          integer;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS depth_mm           integer;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS surface_finish_id  integer REFERENCES surface_finishes(id);
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS frame_shop_item_id integer REFERENCES shop_items(id) ON DELETE SET NULL;
UPDATE artworks SET width_mm  = width_cm  * 10 WHERE width_mm  IS NULL AND width_cm  IS NOT NULL;
UPDATE artworks SET height_mm = height_cm * 10 WHERE height_mm IS NULL AND height_cm IS NOT NULL;
UPDATE artworks SET depth_mm  = depth_cm  * 10 WHERE depth_mm  IS NULL AND depth_cm  IS NOT NULL;

-- ── Orders: frozen frame spec ──────────────────────────────────────────────
ALTER TABLE order_line_items ADD COLUMN IF NOT EXISTS for_artwork_id integer;
ALTER TABLE order_line_items ADD COLUMN IF NOT EXISTS frame_spec     jsonb;

COMMIT;
