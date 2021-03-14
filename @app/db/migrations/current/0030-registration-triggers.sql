/*
 * This trigger is used to validate inserts on app_public.registrations. The
 * trigger makes sure that only valid registrations can be inserted into the
 * database. That is, the related event is open to registrations.
 */

drop function if exists tg__registration_is_valid() cascade;
create function app_private.tg__registration_is_valid() returns trigger as $$
declare
  v_event app_public.events;
  v_event_signup_open boolean;
begin
  select * into v_event from app_public.events where id = NEW.event_id;
  select app_public.events_signup_open(v_event) into v_event_signup_open;

  if v_event_signup_open is false then
    raise exception 'Event registration is not open.' using errcode = 'DNIED';
  end if;

  return NEW;
end;
$$ language plpgsql volatile set search_path to pg_catalog, public, pg_temp;
comment on function app_private.tg__registration_is_valid() is
  E'This trigger validates that a registration is valid. That is, the related event is open to registrations.';
