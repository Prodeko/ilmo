/*
 * These functions are used to create registration secrets that are required
 * to create, update or delete registrations.
 */
drop function if exists app_public.claim_registration_token(uuid, uuid);

create function app_public.claim_registration_token(event_id uuid, quota_id uuid)
  returns uuid
  as $$
declare
  v_token uuid;
  v_registration_id uuid;
begin
  -- Create a new registration secret
  insert into app_private.registration_secrets(event_id, quota_id)
    values (event_id, quota_id)
  returning
    registration_token into v_token;

  -- Create a registration. This means that a spot in the specified event and
  -- quota is reserved for a user when this function is called. The user can
  -- then proceed to enter their information at their own pace without worrying
  -- that the quota would already be filled by the time they finished.
  insert into app_public.registrations(event_id, quota_id)
    values (event_id, quota_id)
  returning
    id into v_registration_id;

  -- Set registration_id to the corresponding row in registration_secrets table
  update app_private.registration_secrets
    set registration_id = v_registration_id
    where registration_token = v_token;

  -- Schedule graphile worker task for token deletion
  perform graphile_worker.add_job(
    'registration__schedule_unfinished_registration_delete',
    json_build_object('token', v_token)
  );

  return v_token;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
comment on function app_public.claim_registration_token(event_id uuid, quota_id uuid) is
  E'Generates a registration token that must be provided during registration. The token is used to prevent F5-wars.';
