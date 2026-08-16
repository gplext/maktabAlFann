-- ============================================================================
-- Maktaba Al-Fann — Migration 03: money as decimals, with an explicit currency
-- ============================================================================
--
--  WHAT THIS FIXES
--
--  1. Every price column is a bare `integer`. You cannot store Rs. 68,500.50,
--     and any future percentage split (commission, tax, discount) rounds badly.
--
--  2. No column anywhere records what currency an amount is in. The artist
--     portal is labelled "Expected Price (PKR)", every page renders "Rs.", and
--     routes/gallery-commission.ts defaults to 'PKR' — but the DATABASE column
--     gallery_commission.currency defaults to 'AED'. Those disagree, silently.
--
--  DECISION (confirmed): the gallery's base currency is PKR.
--
--  Amounts become numeric(12,2) — up to 9,999,999,999.99, exact to the paisa.
--  `currency` is recorded on the two tables that are historical records of a
--  transaction (orders, gallery_commission), frozen at the moment of sale.
--  Catalogue prices (artworks, shop_items) are in the base currency by
--  definition; if you ever sell in a second currency, add the column there too
--  rather than trying to infer it.
--
--  RUN ORDER: after migration-02. Independent of migration-04.
--
--      pg_dump "$DATABASE_URL" --format=plain --no-owner --no-acl \
--        --file=backup-before-migration-03.sql
--
--      psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f migration-03-money.sql
--
--  ⚠ CODE MUST SHIP WITH THIS. PostgreSQL returns `numeric` to node-postgres as
--    a STRING, not a number. The Drizzle schema in lib/db/src/schema/_money.ts
--    converts it back to a JS number on read. If you run this migration against
--    an old build, every price will arrive in the frontend as "68000.00" and
--    arithmetic on it will produce garbage. Deploy together.
--
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Pre-flight — show what is about to be converted
-- ---------------------------------------------------------------------------

SELECT table_name, column_name, data_type
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  (table_name, column_name) IN (
         ('artworks','expected_price'), ('artworks','display_price'),
         ('orders','total_amount'), ('order_line_items','unit_price'),
         ('shop_items','price'), ('shop_item_types','base_price'),
         ('gallery_commission','sale_price'),
         ('gallery_commission','commission_amount'),
         ('gallery_commission','artist_earning'))
ORDER  BY table_name, column_name;

-- Constraints added by migration-01 reference these columns; drop them first so
-- the type change is clean, then re-add at the end. IF EXISTS makes this safe
-- whether or not migration-01 has been run.
ALTER TABLE order_line_items DROP CONSTRAINT IF EXISTS order_line_items_unit_price_check;
ALTER TABLE orders           DROP CONSTRAINT IF EXISTS orders_total_amount_check;

-- ---------------------------------------------------------------------------
-- 1. Catalogue prices
-- ---------------------------------------------------------------------------

ALTER TABLE artworks
  ALTER COLUMN expected_price TYPE numeric(12,2) USING expected_price::numeric(12,2),
  ALTER COLUMN display_price  TYPE numeric(12,2) USING display_price::numeric(12,2);

ALTER TABLE shop_items
  ALTER COLUMN price TYPE numeric(12,2) USING price::numeric(12,2),
  ALTER COLUMN price SET DEFAULT 0;

ALTER TABLE shop_item_types
  ALTER COLUMN base_price TYPE numeric(12,2) USING base_price::numeric(12,2),
  ALTER COLUMN base_price SET DEFAULT 0;

ALTER TABLE artworks
  ADD CONSTRAINT artworks_expected_price_check CHECK (expected_price IS NULL OR expected_price >= 0),
  ADD CONSTRAINT artworks_display_price_check  CHECK (display_price  IS NULL OR display_price  >= 0);

ALTER TABLE shop_items
  ADD CONSTRAINT shop_items_price_check CHECK (price >= 0);

ALTER TABLE shop_item_types
  ADD CONSTRAINT shop_item_types_base_price_check CHECK (base_price >= 0);

-- ---------------------------------------------------------------------------
-- 2. Orders
-- ---------------------------------------------------------------------------

ALTER TABLE orders
  ALTER COLUMN total_amount TYPE numeric(12,2) USING total_amount::numeric(12,2);

ALTER TABLE order_line_items
  ALTER COLUMN unit_price TYPE numeric(12,2) USING unit_price::numeric(12,2);

-- Currency, frozen at the moment the order was placed.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS currency char(3) NOT NULL DEFAULT 'PKR';

ALTER TABLE orders
  ADD CONSTRAINT orders_currency_check CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE orders
  ADD CONSTRAINT orders_total_amount_check CHECK (total_amount >= 0);

ALTER TABLE order_line_items
  ADD CONSTRAINT order_line_items_unit_price_check CHECK (unit_price >= 0);

-- ---------------------------------------------------------------------------
-- 3. Gallery commission — resolve the AED / PKR disagreement
-- ---------------------------------------------------------------------------
-- The column defaulted to 'AED' while routes/gallery-commission.ts passed
-- 'PKR'. The table is empty today, so there is no historical data to preserve;
-- the UPDATE below is written to be correct regardless.

ALTER TABLE gallery_commission
  ALTER COLUMN sale_price        TYPE numeric(12,2) USING sale_price::numeric(12,2),
  ALTER COLUMN commission_amount TYPE numeric(12,2) USING commission_amount::numeric(12,2),
  ALTER COLUMN artist_earning    TYPE numeric(12,2) USING artist_earning::numeric(12,2);

UPDATE gallery_commission SET currency = 'PKR' WHERE currency = 'AED';

ALTER TABLE gallery_commission
  ALTER COLUMN currency SET DEFAULT 'PKR',
  ALTER COLUMN currency TYPE char(3) USING upper(trim(currency))::char(3);

ALTER TABLE gallery_commission
  ADD CONSTRAINT gallery_commission_currency_check CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE gallery_commission
  ADD CONSTRAINT gallery_commission_amounts_check
  CHECK (sale_price >= 0 AND commission_amount >= 0 AND artist_earning >= 0);

-- The split must actually add up. Half a rupee of tolerance absorbs rounding.
ALTER TABLE gallery_commission
  ADD CONSTRAINT gallery_commission_split_check
  CHECK (abs(sale_price - (commission_amount + artist_earning)) <= 0.5);

-- ---------------------------------------------------------------------------
-- 4. Documentation, stored where it cannot be lost
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN artworks.expected_price IS
  'What the artist expects to receive, in the gallery base currency (PKR).';
COMMENT ON COLUMN artworks.display_price IS
  'Public price = expected_price x (1 + artists.default_commission_rate/100), in PKR. Set by the server, never by the client.';
COMMENT ON COLUMN orders.currency IS
  'ISO-4217 code, frozen at time of sale. Base currency is PKR.';
COMMENT ON COLUMN orders.total_amount IS
  'Computed server-side as the sum of order_line_items (unit_price x quantity). Never accepted from the client.';
COMMENT ON COLUMN shop_items.price IS
  'Add-on price in the gallery base currency (PKR).';

-- ---------------------------------------------------------------------------
-- 5. Verify
-- ---------------------------------------------------------------------------

SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  column_name IN ('expected_price','display_price','total_amount',
                       'unit_price','price','base_price','sale_price',
                       'commission_amount','artist_earning','currency')
ORDER  BY table_name, column_name;

-- Existing orders whose total does not match their line items. These are
-- pre-existing: the old checkout added add-on prices into total_amount but
-- never created a line item for them, so the difference is the add-on total.
-- The new server-side pricing creates a line item for every add-on, so this
-- cannot happen again. Nothing here is corrected — they are historical records.
SELECT o.id,
       o.total_amount                                   AS order_total,
       COALESCE(sum(l.unit_price * l.quantity), 0)      AS line_items_total,
       o.total_amount - COALESCE(sum(l.unit_price * l.quantity), 0) AS difference
FROM   orders o
LEFT   JOIN order_line_items l ON l.order_id = o.id
GROUP  BY o.id, o.total_amount
HAVING o.total_amount <> COALESCE(sum(l.unit_price * l.quantity), 0)
ORDER  BY o.id;

COMMIT;

-- ============================================================================
-- ROLLBACK
--
--   ALTER TABLE artworks
--     ALTER COLUMN expected_price TYPE integer USING round(expected_price),
--     ALTER COLUMN display_price  TYPE integer USING round(display_price);
--   ...and so on for each column, then:
--   ALTER TABLE orders DROP COLUMN currency;
--
-- Reverting loses any fractional amounts entered after the migration. Restoring
-- the pg_dump taken at the top of this file is the safer path.
-- ============================================================================
