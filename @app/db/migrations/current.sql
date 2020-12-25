/**********/
-- Event categories

drop table if exists app_public.event_categories cascade;

create table app_public.event_categories(
  id uuid primary key default gen_random_uuid(),
  name text,
  description text,
  owner_organization_id uuid not null references app_public.organizations on delete cascade,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app_public.event_categories enable row level security;

create index on app_public.event_categories(owner_organization_id);

grant
  select, insert (name, description, owner_organization_id, is_public),
  update (name, description, owner_organization_id, is_public),
  delete on app_public.event_categories to :DATABASE_VISITOR;

create policy select_all on app_public.event_categories
  for select
    using (is_public);

create policy manage_own on app_public.event_categories
  for all
  using (exists (select 1
  from
    app_public.organization_memberships
  where
    user_id = app_public.current_user_id() and owner_organization_id = organization_id));

create policy manage_as_admin on app_public.event_categories
  for all
  using (exists (select 1
  from
    app_public.users
  where
    is_admin is true and id = app_public.current_user_id()));

comment on table app_public.event_categories is E'Table for event_categories.';
comment on column app_public.event_categories.id is E'Unique identifier for the event category.';
comment on column app_public.event_categories.name is E'Name of the event category.';
comment on column app_public.event_categories.description is E'Short description of the event category.';
comment on column app_public.event_categories.owner_organization_id is E'Id of the hosting organization.';
comment on column app_public.event_categories.is_public is E'Are events of this category available for everyone.';

create trigger _100_timestamps
  before insert or update on app_public.event_categories for each row
  execute procedure app_private.tg__timestamps();

/**********/
-- Events

drop table if exists app_public.events cascade;

create table app_public.events(
  id uuid primary key default gen_random_uuid(),
  name text,
  description text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  owner_organization_id uuid not null references app_public.organizations on delete cascade,
  category_id uuid not null references app_public.event_categories,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app_public.events enable row level security;

create index on app_public.events using btree (start_time);
create index on app_public.events(owner_organization_id);
create index on app_public.events(category_id);

grant
  select, insert (name, description, start_time, end_time, owner_organization_id, category_id),
  update (name, description, start_time, end_time, owner_organization_id, category_id),
  delete on app_public.events to :DATABASE_VISITOR;

create policy select_all on app_public.events
  for select
    using (true);

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

comment on table app_public.events is E'Main table for events.';
comment on column app_public.events.id is E'Unique identifier for the event.';
comment on column app_public.events.name is E'Name of the event.';
comment on column app_public.events.description is E'Description of the event.';
comment on column app_public.events.start_time is E'Starting time of the event.';
comment on column app_public.events.end_time is E'Ending time of the event.';
comment on column app_public.events.owner_organization_id is E'Id of the organizing organization.';
comment on column app_public.events.category_id is E'Id of the event category.';

create trigger _100_timestamps
  before insert or update on app_public.events for each row
  execute procedure app_private.tg__timestamps();

/**********/
-- Event questions

drop type if exists app_public.question_type cascade;
drop table if exists app_public.event_questions cascade;

create type app_public.question_type as enum (
  'short-text',
  'long-text',
  'option'
);

create table app_public.event_questions(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references app_public.events (id) on delete cascade,
  is_public boolean not null default false,
  type app_public.question_type not null,
  options json
);
alter table app_public.event_questions enable row level security;

create index on app_public.event_questions(event_id);

grant select, insert, update, delete on app_public.event_questions to :DATABASE_VISITOR;

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

/**********/
-- Registration tokens, event registration logic

drop table if exists app_public.registration_tokens cascade;
drop function if exists app_public.claim_registration_token;
drop function if exists app_public.registration_token_by_id(id uuid);

create table app_public.registration_tokens(
  id uuid primary key default gen_random_uuid(),
  token uuid not null default gen_random_uuid(),
  event_id uuid not null references app_public.events (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table app_public.registration_tokens enable row level security;

create index on app_public.registration_tokens(event_id);

create policy select_all on app_public.registration_tokens
  for select
    using (true);

grant select, insert, update, delete on app_public.registration_tokens to :DATABASE_VISITOR;

create policy manage_as_admin on app_public.registration_tokens
  for all
  using (exists (select 1
  from
    app_public.users
  where
    is_admin is true and id = app_public.current_user_id()));

comment on table app_public.registration_tokens is E'Contains event regitration tokens that are used to. Tokens expire in 30 miuntes.';
comment on column app_public.registration_tokens.id is E'Unique identifier for the registration token.';
comment on column app_public.registration_tokens.event_id is E'Unique identifier for the event.';
comment on column app_public.registration_tokens.created_at is E'Short description of the event category.';

create function app_public.claim_registration_token(
  event_id uuid
)
  returns app_public.registration_tokens
  as $$
declare
  v_token app_public.registration_tokens;
begin
  insert into app_public.registration_tokens(event_id)
    values (event_id)
  returning
    * into v_token;
  
  -- Schedule token deletion
  perform graphile_worker.add_job(
    'registration__delete_registration_token',
    json_build_object('tokenId', v_token.id)
  );

  return v_token;
end;
$$
language plpgsql
security definer volatile set search_path to pg_catalog, public, pg_temp;

comment on function app_public.claim_registration_token (event_id uuid) is 
E'Generates a registration token that must be provided as part of the registration information. The token is used to prevent F5-wars.';

create function app_public.registration_token_by_id(
  token_id uuid
)
  returns app_public.registration_tokens
  as $$
declare
  v_token app_public.registration_tokens;
begin
  select
    * into v_token
  from
    app_public.registration_tokens
  where
    token = token_id;
  return v_token;
end;
$$
language plpgsql
security definer stable set search_path to pg_catalog, public, pg_temp;

comment on function app_public.registration_token_by_id (id uuid) is E'Get registration token by token.';


/**********/
-- Registrations

drop table if exists app_public.registrations cascade;

create table app_public.registrations(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references app_public.events (id),
  firstname text not null,
  lastname text not null,
  email citext not null,
  quota text,
  questions_public json,
  questions_private json,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app_public.registrations enable row level security;

create index on app_public.registrations (event_id);

grant select on app_public.registrations to :DATABASE_VISITOR;

create policy manage_as_admin on app_public.registrations
  for all
  using (exists (select 1
  from
    app_public.users
  where
    is_admin is true and id = app_public.current_user_id()));

create trigger _100_timestamps
  before insert or update on app_public.registrations for each row
  execute procedure app_private.tg__timestamps();
