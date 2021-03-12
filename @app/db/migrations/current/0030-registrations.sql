/*
 * The registrations table stores event registrations.
 */

drop table if exists app_public.registrations cascade;
create table app_public.registrations(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references app_public.events(id) on delete cascade,
  quota_id uuid not null references app_public.quotas(id) on delete no action,
  first_name text not null,
  last_name text not null,
  email citext not null check (email ~ '[^@]+@[^@]+\.[^@]+'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app_public.registrations enable row level security;

-- Indices
create index on app_public.registrations(event_id);
create index on app_public.registrations(quota_id);
create index on app_public.registrations(created_at);

-- Triggers
create trigger _100_timestamps
  before insert or update on app_public.registrations for each row
  execute procedure app_private.tg__timestamps();

create trigger _200_send_registration_email
  -- Send email upon successful registration
  after insert on app_public.registrations
  for each row execute procedure app_private.tg__add_job('registration__send_confirmation_email');

create trigger _500_gql_insert
  -- Expose new registrations via a GraphQl subscription. Used for live updating
  -- views in the frontend application.
  after insert or update or delete on app_public.registrations
  for each row
  execute procedure app_public.tg__graphql_subscription(
    'registrationAdded', -- the "event" string, useful for the client to know what happened
    'graphql:eventRegistrations:$1', -- the "topic" the event will be published to, as a template
    'event_id' -- If specified, `$1` above will be replaced with NEW.id or OLD.id from the trigger.
  );

-- Computed columns (https://www.graphile.org/postgraphile/computed-columns/)
create function app_public.registrations_full_name(registration app_public.registrations)
returns text as $$
  select registration.first_name || ' ' || registration.last_name
$$ language sql stable;
grant execute on function app_public.registrations_full_name(registration app_public.registrations) to :DATABASE_VISITOR;
comment on function app_public.registrations_full_name(registration app_public.registrations) is
  E'Returns the full name of a registered person.';

create function app_public.registrations_is_queued(registration app_public.registrations)
  returns boolean as $$
declare
  v_registrations_before_self integer;
  v_quota app_public.quotas;
begin
  select * into v_quota from app_public.quotas where id = registration.quota_id;

  select count(*)
  into v_registrations_before_self
  from app_public.registrations
  where created_at < registration.created_at
    and event_id = registration.event_id
    and quota_id = registration.quota_id;

  if v_registrations_before_self >= v_quota.size then
    return true;
  else
    return false;
  end if;
end;
$$ language plpgsql stable;
grant execute on function app_public.registrations_is_queued(registration app_public.registrations) to :DATABASE_VISITOR;
comment on function app_public.registrations_is_queued(registration app_public.registrations) is
  E'Designates whether the registration is queued for a quota or not.';

-- Comments
comment on table app_public.registrations is
  E'Main table for registrations.';
comment on column app_public.registrations.id is
  E'Unique identifier for the registration.';
comment on column app_public.registrations.event_id is
  E'Identifier of a related event.';
comment on column app_public.registrations.quota_id is
  E'Identifier of a related quota.';
comment on column app_public.registrations.first_name is
  E'First name of the person registering to an event.';
comment on column app_public.registrations.last_name is
  E'Last name of the person registering to an event.';
-- Use @omit to prevet exposing emails via the GraphQL API
comment on column app_public.registrations.email is
  E'@omit\nEmail address of the person registering to an event.';

-- RLS policies and grants
grant
  select,
  insert (event_id, quota_id, first_name, last_name, email),
  -- Don't allow updating an existing registration to another event or quota
  -- Don't allow updating registration email
  update (first_name, last_name),
  delete
on app_public.registrations to :DATABASE_VISITOR;

create policy update_all on app_public.registrations
  for update
    using (true);

create policy select_all on app_public.registrations
  for select
    using (true);

create policy manage_as_admin on app_public.registrations
  for all
  using (exists (select 1
  from
    app_public.users
  where
    is_admin is true and id = app_public.current_user_id()));

