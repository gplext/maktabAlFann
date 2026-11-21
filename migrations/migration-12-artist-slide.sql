-- Marks the painting used for an artist in the Artists page carousel.
-- (The API also adds this column on start-up, so running this file is optional.)
BEGIN;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS artist_slide boolean NOT NULL DEFAULT false;
COMMIT;
