/*
 * The events table stores events that a user of the application can register to.
 * Events can either be upcoming, open to registration or closed.
 */

drop table if exists app_public.events cascade;
create table app_public.events(
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique,
  name jsonb not null,
  description jsonb not null,
  event_start_time timestamptz not null,
  event_end_time timestamptz not null,
  registration_start_time timestamptz not null,
  registration_end_time timestamptz not null,
  is_highlighted boolean not null default false,
  is_draft boolean not null default true,
  header_image_file text,
  owner_organization_id uuid not null references app_public.organizations on delete cascade,
  category_id uuid not null references app_public.event_categories on delete no action,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()

  constraint _cnstr_check_event_time check(event_start_time < event_end_time)
  constraint _cnstr_check_event_registration_time check(registration_start_time < registration_end_time)
  constraint _cnstr_check_registration_end_before_event_start check(registration_end_time < event_start_time)
  constraint _cnstr_check_name_language check(check_language(name))
  constraint _cnstr_check_description_language check(check_language(description))
);
alter table app_public.events enable row level security;

-- Indices
create index on app_public.events(event_start_time);
create index on app_public.events(event_end_time);
create index on app_public.events(registration_start_time);
create index on app_public.events(registration_end_time);
create index on app_public.events(owner_organization_id);
create index on app_public.events(category_id);
create index on app_public.events(is_draft);

-- Triggers
create trigger _100_timestamps
  before insert or update on app_public.events for each row
  execute procedure app_private.tg__timestamps();

-- Computed columns (https://www.graphile.org/postgraphile/computed-columns/)
create function app_public.events_signup_upcoming(e app_public.events)
returns boolean as $$
  select now() < e.registration_start_time;
$$ language sql stable;
comment on function app_public.events_signup_upcoming(e app_public.events) is
  E'Designates whether event signup is upcoming or not.';

create function app_public.events_signup_open(e app_public.events)
returns boolean as $$
  select now() between e.registration_start_time and e.registration_end_time;
$$ language sql stable;
comment on function app_public.events_signup_open(e app_public.events) is
  E'Designates whether event signup is open or not.';

create function app_public.events_signup_closed(e app_public.events)
returns boolean as $$
  select now() > e.registration_end_time;
$$ language sql stable;
comment on function app_public.events_signup_closed(e app_public.events) is
  E'Designates whether event signup is closed or not.';

-- Comments
comment on table app_public.events is
  E'Main table for events.';
comment on column app_public.events.id is
  E'Unique identifier for the event.';
comment on column app_public.events.name is
  E'Name of the event.';
comment on column app_public.events.slug is
  E'Slug for the event.';
comment on column app_public.events.description is
  E'Description of the event.';
comment on column app_public.events.event_start_time is
  E'Starting time of the event.';
comment on column app_public.events.event_end_time is
  E'Ending time of the event.';
  comment on column app_public.events.registration_start_time is
  E'Time of event registration open.';
comment on column app_public.events.registration_end_time is
  E'Time of event registration end.';
comment on column app_public.events.is_highlighted is
  E'A highlighted event.';
comment on column app_public.events.is_draft is
  E'A draft event that is not publicly visible.';
comment on column app_public.events.header_image_file is
  E'Header image for the event';
comment on column app_public.events.owner_organization_id is
  E'Id of the organizer.';
comment on column app_public.events.category_id is
  E'Id of the event category.';

-- RLS policies and grants
grant
  select,
  insert (name, slug, description, event_start_time, event_end_time, registration_start_time, registration_end_time, is_highlighted, is_draft, header_image_file, owner_organization_id, category_id),
  update (name, slug, description, event_start_time, event_end_time, registration_start_time, registration_end_time, is_highlighted, is_draft, header_image_file, owner_organization_id, category_id),
  delete
on app_public.events to :DATABASE_VISITOR;

create policy select_all on app_public.events
  for select
  using (is_draft is false);

create policy manage_own on app_public.events
  for all
  using (exists (select 1
  from
    app_public.organization_memberships
  where
    user_id = app_public.current_user_id() and owner_organization_id = organization_id));

create policy manage_own_category on app_public.events
  for all
  using (exists (select 1
  from
    app_public.organization_memberships
  where
    user_id = app_public.current_user_id() and organization_id = (select owner_organization_id
    from
      app_public.event_categories
    where
      event_categories.id = events.category_id)));

create policy manage_as_admin on app_public.events
  for all
  using (exists (select 1
  from
    app_public.users
  where
    is_admin is true and id = app_public.current_user_id()));
