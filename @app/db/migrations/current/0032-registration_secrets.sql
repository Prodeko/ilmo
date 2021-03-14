/*
 * The registrations_secrets table stores event secrets related to event
 * registrations.
 *
 * In order to create a registration a registration_token (obtained via the
 * claim_registration_token function) must be provided. To update a registration
 * an update_token must be provided. Upon registration, an email containing an
 * update_token is sent to the user.
 */

drop table if exists app_private.registration_secrets cascade;
create table app_private.registration_secrets(
  id uuid primary key default gen_random_uuid(),
  registration_token uuid default gen_random_uuid(),
  update_token uuid default gen_random_uuid(),
  confirmation_email_sent boolean not null default false,

  -- When a registration is deleted, also delete the secrets
  registration_id uuid null references app_public.registrations(id) on delete cascade,
  event_id uuid not null references app_public.events(id) on delete no action,
  quota_id uuid not null references app_public.quotas(id) on delete no action,

  unique(registration_token),
  unique(update_token)
);
alter table app_private.registration_secrets enable row level security;

-- Indices
create index on app_private.registration_secrets(event_id);
create index on app_private.registration_secrets(registration_id);

-- Comments
comment on table app_private.registration_secrets is
  E'The contents of this table should never be visible to the user. Contains data related to event registrations.';
