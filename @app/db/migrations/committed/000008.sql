--! Previous: sha1:afc6149bc215d6e6cf1bcabba9005f9b07e231e0
--! Hash: sha1:2efc6fb4bc77a403bed7fcfd1788a939a2526b11

--! split: 2-block-registration-update-after-close.sql
/*
 * A registration is editable through its update token only while event signup
 * is open, matching `delete_registration`. Admins edit registrations through
 * the same function (after fetching the token with
 * `admin_update_registration`), so they are exempt and can correct
 * registrations after signup has closed.
 */

create or replace function app_public.update_registration(
  "updateToken" text,
  "firstName" text,
  "lastName" text,
  answers jsonb default null
)
returns app_public.registrations as $$
declare
  v_registration_secret app_private.registration_secrets;
  v_registration app_public.registrations;
  v_event app_public.events;
  v_required_question_ids uuid[];
begin
  select * into v_registration_secret
    from app_private.registration_secrets
    where update_token = "updateToken";

  if v_registration_secret is null then
    raise exception 'Registration matching token was not found.' using errcode = 'NTFND';
  end if;

  select * into v_event from app_public.events where id = v_registration_secret.event_id;

  if not app_public.current_user_is_admin()
    and ((v_event is null) or not (select app_public.events_signup_open(v_event))) then
    raise exception 'Updating a registration after event signup has closed is not allowed. Please contact the event organizers.' using errcode = 'DNIED';
  end if;

  -- If the registration doesn't provide answers to all of the required questions it is invalid.
  -- This is double validated in the _200_registration_is_valid trigger.
  v_required_question_ids := array(select id from app_public.event_questions where event_id = v_registration_secret.event_id and is_required = True);
  perform app_public.validate_registration_answers(v_registration_secret.event_id, v_required_question_ids, answers);

  update app_public.registrations
    set first_name = "firstName", last_name = "lastName", answers = update_registration.answers
    where id = v_registration_secret.registration_id
  returning
    * into v_registration;

  return v_registration;
end;
$$ language plpgsql volatile security definer set search_path to pg_catalog, public, pg_temp;

--! split: 3-allow-spaces-in-names.sql
/*
 * `constrained_name` used to reject any whitespace, which made multi-part
 * first and last names (e.g. "Anna Maria" or "von Wright") impossible to
 * register with. The intent was only to stop registrations whose name is
 * nothing but spaces, so require at least one non-whitespace character
 * instead. Null is still allowed because claimRegistrationToken creates a
 * registration before the names are known.
 */

alter domain app_public.constrained_name
  drop constraint if exists constrained_name_check;

alter domain app_public.constrained_name
  add constraint constrained_name_check check (value ~ '\S');

comment on domain app_public.constrained_name is
  E'A name field which must not be empty or contain only whitespace';

--! split: 4-user-first-and-last-name.sql
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

/*
 * The registration form prefers these names over splitting the display name
 * only while `keycloak_names` is on. The login callback stores them whatever
 * the flag's state.
 */
insert into app_public.feature_flags (key, description)
  values (
    'keycloak_names',
    'Prefill the registration form with the first and last name from Keycloak instead of splitting the display name.'
  )
  on conflict (key) do nothing;
