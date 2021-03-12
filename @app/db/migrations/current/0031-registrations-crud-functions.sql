/*
 * These functions define create, update and delete mutations for event
 * registrations. This allows us to specify additional conditions in order to
 * operate on registrations. For example, in order to create a registration a
 * valid registration token must be provided. Similarly, to update or delete a
 * registration a valid update token must be provided. The regitrationToken is
 * obtained via the claim_registration_token function and the update token is
 * emailed to the user on successful event registration.
 *
 * By default PostGraphile creates CRUD mutations for database tables
 * (https://www.graphile.org/postgraphile/crud-mutations/). We have omitted the
 * create, insert, update and delete mutations for the registrations table and
 * use these functions instead. The default mutations are omitted in
 * @app/server/postgraphile.tags.jsonc file.
 */

drop function if exists app_public.create_registration(uuid, uuid, text, text, citext);
drop function if exists app_public.update_registation(uuid, text, text);
drop function if exists app_public.delete_registration(uuid);

create function app_public.create_registration(
  "registrationToken" uuid,
  "eventId" uuid,
  "quotaId" uuid,
  "firstName" text,
  "lastName" text,
  email citext
)
  returns app_public.registrations
  as $$
declare
  v_registration app_public.registrations;
  v_quota app_public.quotas;
  v_event app_public.events;
  v_event_signup_open boolean;
begin
  select * into v_quota from app_public.quotas where id = "quotaId";
  select * into v_event from app_public.events where id = "eventId";

  -- If either event or quota are not found, prevent event registration
  if v_quota.id is null then
    raise exception 'Quota not found.' using errcode = 'NTFND';
  end if;

  if v_event.id is null then
    raise exception 'Event not found.' using errcode = 'NTFND';
  end if;

  -- If the provided token does not exist or is not valid for the specified event
  -- prevent event registration
  if not exists(
    select 1 from app_private.registration_secrets
      where registration_token = "registrationToken"
      and event_id = "eventId"
  ) then
    raise exception 'Registration token was not valid. Please reload the page.' using errcode = 'DNIED';
  end if;

  -- If the registration is not open yet, prevent event registration
  v_event_signup_open := (select app_public.events_signup_open(v_event));
  if not v_event_signup_open then
    raise exception 'Event registration is not open.' using errcode = 'DNIED';
  end if;

  -- Create registration
  insert into app_public.registrations(event_id, quota_id, first_name, last_name, email)
    values ("eventId", "quotaId", "firstName", "lastName", "email")
  returning
    * into v_registration;

  -- Set the used token to null and set registration_id
  update app_private.registration_secrets
    set registration_token = null, registration_id = v_registration.id
    where registration_secrets.registration_token = "registrationToken";

  return v_registration;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
comment on function app_public.create_registration("registrationToken" uuid, "eventId" uuid, "quotaId" uuid, "firstName" text, "lastName" text, email citext) is
  E'Register to an event. Checks that a valid registration token was suplied.';

create function app_public.update_registration(
  "updateToken" uuid,
  "firstName" text,
  "lastName" text
)
  returns app_public.registrations
  as $$
declare
  v_registration_id uuid;
  v_registration app_public.registrations;
begin
  select registration_id into v_registration_id from app_private.registration_secrets where update_token = "updateToken";

  if v_registration_id is null then
    raise exception 'Registration matching token was not found.';
  end if;

  update app_public.registrations
    set first_name = "firstName", last_name = "lastName"
    where id = v_registration_id
  returning
    * into v_registration;

  return v_registration;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
comment on function app_public.update_registration("updateToken" uuid, "firstName" text, "lastName" text) is
  E'Register to an event. Checks that a valid registration token was suplied.';

create function app_public.delete_registration(
  "updateToken" uuid
)
  returns boolean
  as $$
declare
  v_registration_id uuid;
begin
  select registration_id into v_registration_id from app_private.registration_secrets where update_token = "updateToken";

  if v_registration_id is null then
    raise exception 'Registration matching token was not found.';
  end if;

  -- Delete registration and associated secrets
  delete from app_public.registrations where id = v_registration_id;

  return true;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
comment on function app_public.delete_registration("updateToken" uuid) is
  E'Delete event registration.';

create function app_public.registration_by_update_token(
  "updateToken" uuid
)
  returns app_public.registrations
  as $$
declare
  v_registration_id uuid;
  v_registration app_public.registrations;
begin
  select registration_id into v_registration_id from app_private.registration_secrets where update_token = "updateToken";

  if v_registration_id is null then
    return null;
  end if;

  select * into v_registration from app_public.registrations where id = v_registration_id;

  return v_registration;
end;
$$ language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp;
grant execute on function  app_public.registration_by_update_token("updateToken" uuid) to :DATABASE_VISITOR;
comment on function app_public.registration_by_update_token("updateToken" uuid) is
  E'Get registration by update token.';
