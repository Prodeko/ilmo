--! Previous: sha1:6db2c2588b691b5c7a2167901146c86fe5e2b494
--! Hash: sha1:2e188c7c66db89a0094a2de40b2a4aa91c444cc9

-- Enter migration here
drop table if exists app_public.event_categories;

create table app_public.event_categories (
  id uuid primary key default gen_random_uuid(),
  name text,
  description text,
  owner_organization_id uuid not null references app_public.organizations on delete cascade,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

alter table app_public.event_categories enable row level security;

create index on app_public.event_categories (owner_organization_id);

grant
  select,
  insert (name, description, owner_organization_id, is_public),
  update (name, description, owner_organization_id, is_public),
  delete
on app_public.event_categories to :DATABASE_VISITOR;

create policy select_all on app_public.event_categories for select using (is_public);
create policy manage_own on app_public.event_categories for all using (exists (select 1 from app_public.organization_memberships where user_id = app_public.current_user_id() and owner_organization_id = organization_id));
create policy manage_as_admin on app_public.event_categories for all using (exists (select 1 from app_public.users where is_admin is true and id = app_public.current_user_id()));

comment on table app_public.event_categories is
  E'Table for event_categories.';

comment on column app_public.event_categories.id is
  E'Unique identifier for the event category.';
comment on column app_public.event_categories.name is
  E'Name of the event category.';
comment on column app_public.event_categories.description is
  E'Short description of the event category.';
comment on column app_public.event_categories.owner_organization_id is
  E'Id of the hosting organization.';
comment on column app_public.event_categories.is_public is
  E'Are events of this category available for everyone.';

alter table app_public.events
  drop column if exists category_id;

alter table app_public.events
  drop column if exists category;

alter table app_public.events
  add column category_id uuid not null references app_public.organizations;

create index on app_public.events (category_id);

grant
  insert (category_id),
  update (category_id)
on app_public.events to :DATABASE_VISITOR;
