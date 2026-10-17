/*
 * Users only had a single `name`, so the registration form had to guess where
 * the first name ends ("Anna Maria von Wright"). Keycloak already knows the
 * split (the standard `given_name` and `family_name` claims), so keep it on
 * the user and prefill registrations from it. The columns are written by the
 * Keycloak login callback on every login (the member registry is the source
 * of truth), which is why users get no update grant on them. They stay null
 * for accounts that have never logged in through Keycloak.
 */

alter table app_public.users add column if not exists first_name text;
alter table app_public.users add column if not exists last_name text;

comment on column app_public.users.first_name is
  E'The user''s first name(s), from the Keycloak `given_name` claim. Null for users that have not logged in with Keycloak.';
comment on column app_public.users.last_name is
  E'The user''s last name, from the Keycloak `family_name` claim. Null for users that have not logged in with Keycloak.';
