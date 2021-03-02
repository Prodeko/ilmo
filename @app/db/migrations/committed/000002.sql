--! Previous: sha1:ba942d8cbb0359426ffdfb106fffa6b66729ab12
--! Hash: sha1:faff6961992051e6847ffaecdb8f4be1346e7e9a

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

drop function if exists app_public.create_event_quotas(event_id uuid, quotas app_public.create_event_quotas[]);
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

comment on function app_public.create_event_quotas(event_id uuid, quotas app_public.create_event_quotas[]) is
  E'Create event quotas.';

drop type if exists app_public.update_event_quotas cascade;
create type app_public.update_event_quotas as (
  id uuid,
  title jsonb,
  size smallint
);

drop function if exists app_public.update_event_quotas(event_id uuid, quotas app_public.update_event_quotas[]);
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

comment on function app_public.update_event_quotas(event_id uuid, quotas app_public.update_event_quotas[]) is
  E'Update event quotas.';

/**********/
-- Registrations

drop table if exists app_public.registrations cascade;
drop function if exists app_public.create_registration(uuid, uuid, text, text, citext);
drop function if exists app_public.update_registation(uuid, text, text);
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
  after insert or update or delete on app_public.registrations
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

create trigger _100_timestamps
  before insert or update on app_public.registrations for each row
  execute procedure app_private.tg__timestamps();

/**********/
-- Registration secrets

drop table if exists app_private.registration_secrets cascade;
drop function if exists app_public.claim_registration_token(uuid);
drop function if exists app_public.delete_registration_token(uuid);
drop function if exists app_public.create_registration(uuid, uuid, uuid, text, text, citext);
drop function if exists app_public.update_registration(uuid, text, text);
drop function if exists app_public.delete_registration(uuid);
drop function if exists app_public.registration_by_update_token(uuid);

create table app_private.registration_secrets(
  id uuid primary key default gen_random_uuid(),
  registration_token uuid default gen_random_uuid(),
  update_token uuid default gen_random_uuid(),

  registration_id uuid null references app_public.registrations(id) on delete cascade,
  event_id uuid not null references app_public.events(id) on delete no action
);
alter table app_private.registration_secrets enable row level security;

comment on table app_private.registration_secrets is
  E'The contents of this table should never be visible to the user. Contains data related to event registrations.';

create index on app_private.registration_secrets(event_id);
create index on app_private.registration_secrets(registration_id);

-- Schedule graphile worker task for token timeout
create function app_public.claim_registration_token(
  event_id uuid
)
  returns uuid
  as $$
declare
  v_token uuid;
begin
  insert into app_private.registration_secrets(event_id)
    values (event_id)
  returning
    registration_token into v_token;

  -- Schedule token deletion
  perform graphile_worker.add_job(
    'registration__delete_registration_token',
    json_build_object('token', v_token)
  );

  return v_token;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;

comment on function app_public.claim_registration_token(event_id uuid) is
  E'Generates a registration token that must be provided during registration. The token is used to prevent F5-wars.';

-- The function below is used by registration__delete_registration_token
-- worker task to bypass RLS policies on app_private.registration_secrets table.
-- This is achieved by setting SECURITY DEFINER to make this a 'sudo' function.
create function app_public.delete_registration_token(
  token uuid
)
returns bigint
as $$
  with deleted as (
    -- Delete timed out token
    delete from app_private.registration_secrets
    where registration_secrets.registration_token = token
    returning *
  )

  -- Return number of deleted rows
  select count(*) from deleted;
$$
language sql
security definer volatile set search_path to pg_catalog, public, pg_temp;

comment on function app_public.delete_registration_token(token uuid) is
  E'Delete registration token by token id. Used by worker task to bypass RLS policies. Should not be publicly visible.';

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

create function app_public.create_registration(
  "registrationToken" uuid,
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
  v_event app_public.events;
  v_event_signup_open boolean;
begin
  select * into v_quota from app_public.quotas where id = "quotaId";
  select * into v_event from app_public.events where id = "eventId";

  -- If either event or quota are not found, prevent event registration
  if v_quota.id is null then
    raise exception 'Quota not found.' using errcode = 'NTFND';
  end if;

  if v_event.id is null then
    raise exception 'Event not found.' using errcode = 'NTFND';
  end if;

  -- If the provided token does not exist or is not valid for the specified event
  -- prevent event registration
  if not exists(
    select 1 from app_private.registration_secrets
      where registration_token = "registrationToken"
      and event_id = "eventId"
  ) then
    raise exception 'Registration token was not valid. Please reload the page.' using errcode = 'DNIED';
  end if;

  -- If the registration is not open yet, prevent event registration
  v_event_signup_open := (select app_public.events_signup_open(v_event));
  if not v_event_signup_open then
    raise exception 'Event registration is not open.' using errcode = 'DNIED';
  end if;

  -- Create registration
  insert into app_public.registrations(event_id, quota_id, first_name, last_name, email)
    values ("eventId", "quotaId", "firstName", "lastName", "email")
  returning
    * into v_registration;

  -- Set the used token to null and set registration_id
  update app_private.registration_secrets
    set registration_token = null, registration_id = v_registration.id
    where registration_secrets.registration_token = "registrationToken";

  return v_registration;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;

comment on function app_public.create_registration("registrationToken" uuid, "eventId" uuid, "quotaId" uuid, "firstName" text, "lastName" text, email citext) is
  E'Register to an event. Checks that a valid registration token was suplied.';

create function app_public.update_registration(
  "updateToken" uuid,
  "firstName" text,
  "lastName" text
)
  returns app_public.registrations
  as $$
declare
  v_registration_id uuid;
  v_registration app_public.registrations;
begin
  select registration_id into v_registration_id from app_private.registration_secrets where update_token = "updateToken";

  if v_registration_id is null then
    raise exception 'Registration matching token was not found.';
  end if;

  update app_public.registrations
    set first_name = "firstName", last_name = "lastName"
    where id = v_registration_id
  returning
    * into v_registration;

  return v_registration;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;

comment on function app_public.update_registration("updateToken" uuid, "firstName" text, "lastName" text) is
  E'Register to an event. Checks that a valid registration token was suplied.';

create function app_public.delete_registration(
  "updateToken" uuid
)
  returns boolean
  as $$
declare
  v_registration_id uuid;
begin
  select registration_id into v_registration_id from app_private.registration_secrets where update_token = "updateToken";

  if v_registration_id is null then
    raise exception 'Registration matching token was not found.';
  end if;

  -- Delete registration and associated secrets
  delete from app_public.registrations where id = v_registration_id;

  return true;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;

comment on function app_public.delete_registration("updateToken" uuid) is
  E'Delete event registration.';

create function app_public.registration_by_update_token(
  "updateToken" uuid
)
  returns app_public.registrations
  as $$
declare
  v_registration_id uuid;
  v_registration app_public.registrations;
begin
  select registration_id into v_registration_id from app_private.registration_secrets where update_token = "updateToken";

  if v_registration_id is null then
    return null;
  end if;

  select * into v_registration from app_public.registrations where id = v_registration_id;

  return v_registration;
end;
$$ language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp;
grant execute on function  app_public.registration_by_update_token("updateToken" uuid) to :DATABASE_VISITOR;

comment on function app_public.registration_by_update_token("updateToken" uuid) is
  E'Get registration by update token.';
