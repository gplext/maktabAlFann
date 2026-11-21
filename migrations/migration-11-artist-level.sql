-- migration-11: artist level (master / emerging / student), chosen when an artist registers
-- and used by the level filter on /artists. Safe to re-run.
BEGIN;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'emerging';
ALTER TABLE artists DROP CONSTRAINT IF EXISTS artists_level_check;
ALTER TABLE artists ADD CONSTRAINT artists_level_check CHECK (level IN ('master', 'emerging', 'student'));
COMMIT;
