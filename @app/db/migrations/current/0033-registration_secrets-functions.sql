/*
 * These functions are used to create registration secrets that are required
 * to create, update or delete registrations.
 */
drop function if exists app_public.claim_registration_token(uuid);
drop function if exists app_public.delete_registration_token(uuid);

create function app_public.claim_registration_token(
  event_id uuid
)
  returns uuid
  as $$
declare
  v_token uuid;
begin
  insert into app_private.registration_secrets(event_id)
    values (event_id)
  returning
    registration_token into v_token;

  -- Schedule graphile worker task for token deletion
  perform graphile_worker.add_job(
    'registration__delete_registration_token',
    json_build_object('token', v_token)
  );

  return v_token;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
comment on function app_public.claim_registration_token(event_id uuid) is
  E'Generates a registration token that must be provided during registration. The token is used to prevent F5-wars.';

-- The function below is used by registration__delete_registration_token graphile
-- worker task to bypass RLS policies on app_private.registration_secrets table.
-- This is achieved by setting SECURITY DEFINER to make this a 'sudo' function.
create function app_public.delete_registration_token(
  token uuid
)
returns bigint
as $$
  with deleted as (
    -- Delete timed out token
    delete from app_private.registration_secrets
    where registration_secrets.registration_token = token
    returning *
  )

  -- Return number of deleted rows
  select count(*) from deleted;
$$
language sql
security definer volatile set search_path to pg_catalog, public, pg_temp;
comment on function app_public.delete_registration_token(token uuid) is
  E'Delete registration token by token id. Used by worker task to bypass RLS policies. Should not be publicly visible.';
