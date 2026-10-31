-- ============================================================================
-- Read-only database login, for browsing the live database (DBeaver / pgAdmin)
-- without any risk of changing data. It can SELECT, nothing else.
--
-- Run once, through the SSH tunnel, as the main database user:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v ro_password='choose-a-strong-password' -f deploy/create-readonly-user.sql
-- Safe to run again (it just updates the password).
-- ============================================================================
SELECT format('CREATE ROLE maf_readonly LOGIN PASSWORD %L', :'ro_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maf_readonly') \gexec
SELECT format('ALTER ROLE maf_readonly LOGIN PASSWORD %L', :'ro_password') \gexec

ALTER ROLE maf_readonly SET default_transaction_read_only = on;
SELECT format('GRANT CONNECT ON DATABASE %I TO maf_readonly', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO maf_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO maf_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO maf_readonly;
-- Tables added by future migrations are readable too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO maf_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO maf_readonly;
