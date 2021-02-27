--! Previous: sha1:4f4bcc659f537f697e05e587b992fbaf8291a21e
--! Hash: sha1:ca109441f679eae610a89bb3bc3384b4319dd209

--! split: 1-current.sql
/**********/
-- Event categories

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

create index on app_public.event_categories(owner_organization_id);
create index on app_public.event_categories(name);

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

create trigger _100_timestamps
  before insert or update on app_public.event_categories for each row
  execute procedure app_private.tg__timestamps();

/**********/
-- Events

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

create function app_public.events_signup_upcoming(e app_public.events)
returns boolean as $$
  select now() < e.registration_start_time;
$$ language sql stable;

comment on function app_public.events_signup_upcoming(e app_public.events) is
  E'Designated whether event signup is upcoming or not.';

create function app_public.events_signup_open(e app_public.events)
returns boolean as $$
  select now() between e.registration_start_time and e.registration_end_time;
$$ language sql stable;

comment on function app_public.events_signup_open(e app_public.events) is
  E'Designated whether event signup is open or not.';

create function app_public.events_signup_closed(e app_public.events)
returns boolean as $$
  select now() > e.registration_end_time;
$$ language sql stable;

comment on function app_public.events_signup_closed(e app_public.events) is
  E'Designated whether event signup is closed or not.';

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

create index on app_public.events(event_start_time);
create index on app_public.events(event_end_time);
create index on app_public.events(registration_start_time);
create index on app_public.events(registration_end_time);
create index on app_public.events(owner_organization_id);
create index on app_public.events(category_id);
create index on app_public.events(is_draft);

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
  event_id uuid not null references app_public.events(id) on delete cascade,
  type app_public.question_type not null,
  options json,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app_public.event_questions enable row level security;

create index on app_public.event_questions(event_id);

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

create trigger _100_timestamps
  before insert or update on app_public.event_questions for each row
  execute procedure app_private.tg__timestamps();

/**********/
-- Registration tokens

drop table if exists app_public.registration_tokens cascade;
drop function if exists app_public.claim_registration_token(uuid);
drop function if exists app_public.delete_registration_token(uuid);

create table app_public.registration_tokens(
  token uuid primary key default gen_random_uuid(),
  event_id uuid not null references app_public.events(id) on delete no action,
  created_at timestamptz not null default now()
);
alter table app_public.registration_tokens enable row level security;

comment on table app_public.registration_tokens is
  E'Contains event regitration tokens that are used to. Tokens expire in 30 miuntes.';
comment on column app_public.registration_tokens.event_id is
  E'Unique identifier for the event.';
comment on column app_public.registration_tokens.created_at is
  E'Timestamp of when the token was created.';

create index on app_public.registration_tokens(event_id);

-- Schedule graphile worker task for token timeout
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
    json_build_object('token', v_token.token)
  );

  return v_token;
end;
$$
language plpgsql strict
security definer volatile set search_path to pg_catalog, public, pg_temp;

comment on function app_public.claim_registration_token(event_id uuid) is
  E'Generates a registration token that must be provided during registration. The token is used to prevent F5-wars.';

-- The function below is used by registration__delete_registration_token
-- worker task to bypass RLS policies on app_public.registration_tokens table.
-- This is achieved by setting SECURITY DEFINER to make this a 'sudo' function.
create function app_public.delete_registration_token(
  token uuid
)
returns bigint
as $$
  with deleted as (
    -- Delete timed out token
    delete from app_public.registration_tokens
    where registration_tokens.token = delete_registration_token.token
    returning *
  )

  -- Return number of deleted rows
  select count(*) from deleted;
$$
language sql
security definer volatile set search_path to pg_catalog, public, pg_temp;

comment on function app_public.delete_registration_token(token uuid) is
  E'Delete registration token by token id. Used by worker task to bypass RLS policies.';

/**********/
-- Quotas

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

create index on app_public.quotas(id);
create index on app_public.quotas(event_id);

-- Allow update only on title and size. This means that once
-- a quota is created it cannot be moved to another event
grant
  select,
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

create trigger _100_timestamps
  before insert or update on app_public.quotas for each row
  execute procedure app_private.tg__timestamps();

drop type if exists app_public.create_event_quotas cascade;
create type app_public.create_event_quotas as (
  title jsonb,
  size smallint
);

create function app_public.create_event_quotas(
  event_id uuid,
  quotas app_public.create_event_quotas[]
)
returns app_public.quotas[]
as $$
  declare
    v_input app_public.create_event_quotas;
    v_quota app_public.quotas;
    v_ret app_public.quotas[] default '{}';
  begin
    if app_public.current_user_id() is null then
      raise exception 'You must log in to create event quotas' using errcode = 'LOGIN';
    end if;

    if (select array_length(quotas, 1)) is null then
      raise exception 'You must specify at least one quota' using errcode = 'DNIED';
    end if;

    foreach v_input in array quotas loop
      insert into app_public.quotas(event_id, title, size)
        values (event_id, v_input.title, v_input.size)
        returning * into v_quota;

      v_ret := array_append(v_ret, v_quota);
    end loop;

    return v_ret;
  end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;

drop type if exists app_public.update_event_quotas cascade;
create type app_public.update_event_quotas as (
  id uuid,
  title jsonb,
  size smallint
);

create function app_public.update_event_quotas(
  event_id uuid,
  quotas app_public.update_event_quotas[]
)
returns app_public.quotas[]
as $$
#variable_conflict use_variable
  declare
  v_test int;
    v_quota_ids_to_delete uuid[];
    v_input app_public.update_event_quotas;
    v_quota app_public.quotas;
    v_ret app_public.quotas[] default '{}';
  begin
    if app_public.current_user_id() is null then
      raise exception 'You must log in to update event quotas' using errcode = 'LOGIN';
    end if;

    if (select array_length(quotas, 1)) is null then
      raise exception 'You must specify at least one quota' using errcode = 'DNIED';
    end if;

    select array(
      select id from app_public.quotas as q
      where q.event_id = event_id
      and q.id not in (select id from unnest(quotas))
    )
    into v_quota_ids_to_delete;

    -- Delete existing event quotas that were not supplied
    -- as input to this function
    delete from app_public.quotas as q
      where q.id = any(v_quota_ids_to_delete);

    -- Update existing event quotas by id
    foreach v_input in array quotas loop

      if exists(select 1 from app_public.quotas where id = v_input.id) then
        update app_public.quotas
          set title = v_input.title, size = v_input.size
          where id = v_input.id
        returning * into v_quota;
      else
        -- Create new quotas that didn't exits before
        insert into app_public.quotas(event_id, title, size)
          values (event_id, v_input.title, v_input.size)
        returning * into v_quota;
      end if;

      v_ret := array_append(v_ret, v_quota);
    end loop;

    return v_ret;
  end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;

/**********/
-- Registrations

drop table if exists app_public.registrations cascade;
drop function if exists app_public.create_registration(uuid, uuid, text, text, citext);
drop function if exists app_public.registration_send_email();

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

create trigger _100_send_registration_email
  after insert on app_public.registrations
  for each row execute procedure app_private.tg__add_job('registration__send_confirmation_email');

create trigger _500_gql_insert
  after insert on app_public.registrations
  for each row
  execute procedure app_public.tg__graphql_subscription(
    'registrationAdded', -- the "event" string, useful for the client to know what happened
    'graphql:eventRegistrations:$1', -- the "topic" the event will be published to, as a template
    'event_id' -- If specified, `$1` above will be replaced with NEW.id or OLD.id from the trigger.
  );

create index on app_public.registrations(event_id);
create index on app_public.registrations(quota_id);
create index on app_public.registrations(created_at);

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
comment on column app_public.registrations.email is
  E'@omit\nEmail address of the person registering to an event.';

grant
  select,
  insert (event_id, quota_id, first_name, last_name, email),
  update (event_id, quota_id, first_name, last_name, email),
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

create trigger _100_timestamps
  before insert or update on app_public.registrations for each row
  execute procedure app_private.tg__timestamps();

create function app_public.registrations_full_name(registration app_public.registrations) returns text as $$
  select registration.first_name || ' ' || registration.last_name
$$ language sql stable;
grant execute on function app_public.registrations_full_name(registration app_public.registrations) to :DATABASE_VISITOR;

comment on function app_public.registrations_full_name(registration app_public.registrations) is
  E'Returns the full name of a registered person.';

create function app_public.create_registration(
  token uuid,
  "eventId" uuid,
  "quotaId" uuid,
  "firstName" text,
  "lastName" text,
  email citext
)
  returns app_public.registrations
  as $$
declare
  v_registration app_public.registrations;
  v_quota app_public.quotas;
  v_num_registrations integer;
begin
  -- If the provided token does not exist, prevent event registration
  if not exists(
    select 1 from app_public.registration_tokens
      where registration_tokens.token = create_registration.token
  ) then
    raise exception 'Registration token was not valid. Please reload the page.' using errcode = 'DNIED';
  end if;

  select count(*)
    into v_num_registrations
    from app_public.registrations
    where registrations.quota_id = "quotaId";

  select *
    into v_quota
    from app_public.quotas
    where id = "quotaId";

  -- If the quota is already full, prevent event registration
  if (v_num_registrations >= v_quota.size) then
    raise exception 'Event quota already full.' using errcode = 'DNIED';
  end if;

  insert into app_public.registrations(event_id, quota_id, first_name, last_name, email)
    values ("eventId", "quotaId", "firstName", "lastName", "email")
  returning
    * into v_registration;

  -- Delete the used token
  delete from app_public.registration_tokens
    where registration_tokens.token = create_registration.token;

  return v_registration;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;

comment on function app_public.create_registration(token uuid, "eventId" uuid, "quotaId" uuid, "firstName" text, "lastName" text, email citext) is
  E'Register to an event. Checks that a valid registration token was suplied.';
