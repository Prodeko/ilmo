-- Stop ilmo containers, then
SELECT * FROM pg_replication_slots;
SELECT pg_drop_replication_slot('fyzcicggtwwhyomtewrqdqtvmbpopw');

SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = 'ilmo'
  AND pid <> pg_backend_pid();

DROP DATABASE ilmo;
CREATE DATABASE ilmo;

\c ilmo

GRANT ALL PRIVILEGES ON DATABASE ilmo TO user_ilmo;
GRANT ALL ON SCHEMA public to user_ilmo;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO user_ilmo;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO user_ilmo;
GRANT USAGE ON SCHEMA public TO ilmo_visitor;

CREATE SCHEMA app_hidden AUTHORIZATION user_ilmo;
CREATE SCHEMA app_private AUTHORIZATION user_ilmo;
CREATE SCHEMA app_public AUTHORIZATION user_ilmo;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;
COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';

-- vim docker-compose.prod.yml
-- Change yarn server start to yarn db migrate
-- Restart with docker-compose -f docker-compose.prod.yml up
-- Migrations should run
-- Change back to yarn server start
-- Restart with docker-compose -f docker-compose.prod.yml up
