-- Enter migration here
drop policy if exists select_all on app_public.organizations;
create policy select_all on app_public.organizations for select using (true);

drop table if exists app_public.registeration_tokens cascade;
drop table if exists app_public.registration_tokens cascade;
drop function if exists app_public.register_to_event;
drop function if exists app_public.registeration_token_by_id();
drop function if exists app_public.registeration_token_by_id(id uuid);
drop function if exists app_public.registration_token_by_id();
drop function if exists app_public.registration_token_by_id(id uuid);

create table app_public.registration_tokens (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references app_public.events(id) on delete cascade,
  created_at timestamptz not null default NOW()
);
alter table app_public.registration_tokens enable row level security;

create policy select_all on app_public.registration_tokens for select using (true);
grant select(event_id, created_at) on app_public.registration_tokens to :DATABASE_VISITOR;

create index on app_public.registration_tokens(event_id);

create function app_public.register_to_event(event_id uuid) returns uuid as $$
declare
  token uuid;
begin
  insert into app_public.registration_tokens (event_id) values (event_id) returning id into token;
  return token;
end;
$$ language plpgsql security definer volatile set search_path to pg_catalog, public, pg_temp;

create function app_public.registration_token_by_id (id uuid) returns app_public.registration_tokens as $$
  select registration_tokens.* from app_public.registration_tokens where id = registration_tokens.id;
$$ language sql security definer stable set search_path to pg_catalog, public, pg_temp;
comment on function app_public.registration_token_by_id(id uuid) is
  E'Rest of the registration token :D';

drop table if exists app_public.registration_questions_public;
drop table if exists app_private.registration_questions_private;
drop table if exists app_public.registrations;
drop table if exists app_public.registerations;
drop function if exists app_public.confirm_registration (
  id uuid,
  event_id uuid,
  email citext,
  firstname text,
  lastname text,
  quota text
);

create table app_public.registrations (
  id uuid primary key,
  event_id uuid not null references app_public.events(id),
  firstname text not null,
  lastname text not null,
  email citext not null,
  created_at timestamptz not null,
  quota text,
  questions_public json,
  questions_private json
);

create index on app_public.registrations(event_id);

grant
  select (event_id, firstname, lastname, quota, questions_public)
on app_public.registrations to :DATABASE_VISITOR;

drop policy if exists manage_own_category on app_public.events;
create policy manage_own_category on app_public.events for all using (EXISTS(SELECT 1 FROM app_public.organization_memberships where user_id = app_public.current_user_id() and organization_id = (SELECT owner_organization_id FROM app_public.event_categories WHERE event_categories.id = events.category_id)));

drop table if exists app_public.event_questions;

drop type if exists app_public.question_type;
create type app_public.question_type AS ENUM ('short-text', 'long-text', 'option');

create table app_public.event_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references app_public.events(id) on delete cascade,
  is_public boolean not null default false,
  type app_public.question_type not null,
  options json
);
alter table app_public.event_questions enable row level security;

create index on app_public.event_questions(event_id);

grant
  select,
  insert,
  update,
  delete
on app_public.event_questions to :DATABASE_VISITOR;

create policy select_all on app_public.event_questions for select using (true);
create policy manage_own on app_public.event_questions for all using (exists (select 1 from app_public.organization_memberships where user_id = app_public.current_user_id() and organization_id = (SELECT owner_organization_id from app_public.events where events.id = event_questions.event_id)));
create policy manage_own_category on app_public.event_questions for all using (EXISTS(SELECT 1 FROM app_public.organization_memberships where user_id = app_public.current_user_id() and organization_id = (SELECT owner_organization_id FROM app_public.event_categories WHERE event_categories.id = (SELECT category_id from app_public.events where events.id = event_questions.event_id))));
create policy manage_as_admin on app_public.event_questions for all using (exists (select 1 from app_public.users where is_admin is true and id = app_public.current_user_id()));

