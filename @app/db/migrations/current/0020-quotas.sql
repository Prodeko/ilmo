/*
 * The quotas table defines quotas for event registrations. Once a quota is full
 * no more registrations are allowed and additional registrations are considered
 * to be in queue for the quota. There may be multiple quotas with different
 * sizes for a single event.
 */

drop table if exists app_public.quotas cascade;
create table app_public.quotas(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references app_public.events(id) on delete cascade,
  title jsonb not null,
  size smallint not null check (size > 0),
  -- TODO: Implement questions
  questions_public json,
  questions_private json,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint _cnstr_check_title_language check(check_language(title))
);
alter table app_public.quotas enable row level security;

-- Indices
create index on app_public.quotas(id);
create index on app_public.quotas(event_id);

-- Triggers
create trigger _100_timestamps
  before insert or update on app_public.quotas for each row
  execute procedure app_private.tg__timestamps();

-- Comments
comment on table app_public.quotas is
  E'Main table for registration quotas.';
comment on column app_public.quotas.event_id is
  E'Identifier of the event that this quota is for.';
comment on column app_public.quotas.title is
  E'Title for the quota.';
comment on column app_public.quotas.size is
  E'Size of the quota.';
comment on column app_public.quotas.questions_public is
  E'Public questions related to the quota.';
comment on column app_public.quotas.questions_private is
  E'Private questions related to the quota.';

-- RLS policies and grants
grant
  select,
  -- Allow update only on title and size. This means that once
  -- a quota is created it cannot be moved to another event
  insert (event_id, title, size),
  update (title, size),
  delete
on app_public.quotas to :DATABASE_VISITOR;

create policy select_all on app_public.quotas
  for select
    using (true);

create policy manage_own on app_public.quotas
  for all
  using (exists (select 1
  from
    app_public.organization_memberships
  where
    user_id = app_public.current_user_id() and organization_id = (select owner_organization_id
    from
      app_public.events
    where
      events.id = quotas.event_id)));

create policy manage_as_admin on app_public.quotas
  for all
  using (exists (select 1
  from
    app_public.users
  where
    is_admin is true and id = app_public.current_user_id()));
