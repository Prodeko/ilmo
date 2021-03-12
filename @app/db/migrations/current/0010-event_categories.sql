/*
 * The event categories table is to categorize events and to enforce RLS policies
 * on events. For example, only the members of owner_organization_id organization
 * can see private event registration information (such as allergies) and update
 * event details.
 */
drop table if exists app_public.event_categories cascade;

create table app_public.event_categories(
  id uuid primary key default gen_random_uuid(),
  name jsonb not null,
  description jsonb not null,
  owner_organization_id uuid not null references app_public.organizations on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()

  constraint _cnstr_check_name_language check(check_language(name))
  constraint _cnstr_check_description_language check(check_language(description))
);
alter table app_public.event_categories enable row level security;

-- Indices
create index on app_public.event_categories(owner_organization_id);
create index on app_public.event_categories(name);

-- Triggers
create trigger _100_timestamps
  before insert or update on app_public.event_categories for each row
  execute procedure app_private.tg__timestamps();

-- Comments
comment on table app_public.event_categories is
  E'Table for event categories.';
comment on column app_public.event_categories.id is
  E'Unique identifier for the event category.';
comment on column app_public.event_categories.name is
  E'Name of the event category.';
comment on column app_public.event_categories.description is
  E'Short description of the event category.';
comment on column app_public.event_categories.owner_organization_id is
  E'Identifier of the organizer.';

-- RLS policies and grants
grant
  select,
  insert (name, description, owner_organization_id),
  update (name, description, owner_organization_id),
  delete
on app_public.event_categories to :DATABASE_VISITOR;

create policy select_all on app_public.event_categories
  for select using (true);

create policy manage_member on app_public.event_categories
  for all using (owner_organization_id in (select app_public.current_user_member_organization_ids()));
