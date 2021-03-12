/*
 * The events_questions table stores questions that can be asked during event
 * registration. TODO: not implemented yet.
 */

drop type if exists app_public.question_type cascade;
drop table if exists app_public.event_questions cascade;

create type app_public.question_type as enum (
  'short-text',
  'long-text',
  'option'
);

create table app_public.event_questions(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references app_public.events(id) on delete cascade,
  type app_public.question_type not null,
  options json,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app_public.event_questions enable row level security;

-- Indices
create index on app_public.event_questions(event_id);

-- Triggers
create trigger _100_timestamps
  before insert or update on app_public.event_questions for each row
  execute procedure app_private.tg__timestamps();

-- RLS policies and grants
grant
  select,
  insert (event_id, type, options),
  update (event_id, type, options),
  delete
on app_public.event_questions to :DATABASE_VISITOR;

create policy select_all on app_public.event_questions
  for select
    using (true);

create policy manage_own on app_public.event_questions
  for all
  using (exists (select 1
  from
    app_public.organization_memberships
  where
    user_id = app_public.current_user_id() and organization_id = (select owner_organization_id
    from
      app_public.events
    where
      events.id = event_questions.event_id)));

create policy manage_own_category on app_public.event_questions
  for all
  using (exists (select 1
  from
    app_public.organization_memberships
  where
    user_id = app_public.current_user_id() and organization_id = (select owner_organization_id
    from
      app_public.event_categories
    where
      event_categories.id = (select category_id
      from
        app_public.events
      where
        events.id = event_questions.event_id))));

create policy manage_as_admin on app_public.event_questions
  for all
  using (exists (select 1
  from
    app_public.users
  where
    is_admin is true and id = app_public.current_user_id()));
