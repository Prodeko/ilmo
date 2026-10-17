-- Roles and database for the stress stack. The owner is a superuser only
-- while migrations run; the `finalize` service demotes it so that, as on
-- Azure, no ilmo role can use the superuser-reserved connection slots.
create role ilmo with login password 'stress' superuser;
create role ilmo_authenticator with login password 'stress' noinherit;
create role ilmo_visitor;
grant ilmo_visitor to ilmo_authenticator;
create database ilmo owner ilmo;

-- Equivalent of @app/db/migrations/afterReset.sql
\connect ilmo
grant connect on database ilmo to ilmo;
grant connect on database ilmo to ilmo_authenticator;
grant all on database ilmo to ilmo;
alter schema public owner to ilmo;
create extension if not exists "uuid-ossp" with schema public;
create extension if not exists citext with schema public;
create extension if not exists pgcrypto with schema public;
