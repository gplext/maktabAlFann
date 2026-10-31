-- ============================================================================
-- Migration 07 — Brown croc-leather frame
--   Moulding: flat leather-wrapped board, 18 mm face, 5 mm thick.
--   The painting is fixed behind the board, so canvases up to 60 mm deep fit.
--   Frame product is created INACTIVE with price 0: set the price / price per
--   metre in Admin → Frames, then switch it to Active in Admin → Shop.
-- Needs migration-06. Safe to run more than once:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/migration-07-croc-leather-frame.sql
-- ============================================================================
BEGIN;

INSERT INTO frame_profiles (name, style, material, profile_shape, face_width_mm, depth_mm, rebate_width_mm, rebate_depth_mm,
                            reveal_gap_mm, colour_hex, metalness, roughness, texture_url, display_order)
VALUES ('Brown Croc Leather', 'standard', 'leather', 'flat', 18, 5, 5, 60,
        0, '#2F2020', 0.05, 0.45, '/images/frames/croc-leather-brown.jpg', 4)
ON CONFLICT (name) DO NOTHING;

INSERT INTO shop_items (name, description, type, image_url, is_addon, stock, status, price, frame_profile_id, glazing, backing)
SELECT 'Brown Croc Leather Frame',
       'Brown crocodile-embossed leather frame, 18 mm face, 5 mm thick. Made to measure for the painting.',
       'Frames', '/images/frames/croc-leather-brown.jpg', true, 10, 'inactive', 0,
       (SELECT id FROM frame_profiles WHERE name = 'Brown Croc Leather'), 'none', 'none'
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE name = 'Brown Croc Leather Frame');

COMMIT;
