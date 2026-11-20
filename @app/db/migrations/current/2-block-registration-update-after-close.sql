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
