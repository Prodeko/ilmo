--! Previous: sha1:9169a317f74df0f542b7c149ef9d6de44d47cd27
--! Hash: sha1:c3e038e724e27f0a857709e19c239448f7000642

--! split: 0001-rls-helpers-1.sql
/*
 * Helpers for defining RLS policies.
 *
 * Examples:
 *  create policy manage_admin on app_public.events for all using(app_public.current_user_is_admin());
 *  create policy manage_organization on app_public.events for all using(app_public.current_user_is_owner_organization_member(owner_organization_id));
 */

create function app_public.current_user_is_admin() returns boolean as $$
  select exists (
    select 1
    from app_public.users
    where
      id = app_public.current_user_id()
      and is_admin = true)
$$ language sql stable security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_public.current_user_is_admin() is
  E'Returns true if the current user is admin, false otherwise.';

create function app_public.current_user_is_owner_organization_member(owner_organization_id uuid) returns boolean as $$
  select owner_organization_id in (
    select app_public.current_user_member_organization_ids()
  )
$$ language sql stable security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_public.current_user_is_owner_organization_member(owner_organization_id uuid) is
  E'Returns true if the current user is a member of the organization id passed as input, false otherwise.';

--! split: 0002-common-functions.sql
/*
 * These functions are commonly used across many tables.
 */

-- Used as a check constraint to verify that a column contains
-- the required languages. Language dependent columns are stored as
-- jsonb.
create function app_public.check_language(_column jsonb)
  returns boolean
  as $$
declare
  v_supported_languages text[];
begin
  select supported_languages into v_supported_languages from app_public.languages();

  return (
    -- Check that supported_languages exist as top level keys in _column
    select _column ?| v_supported_languages
    -- ...and that _column contains no other top level keys than supported_languages
    and (select v_supported_languages @> array_agg(keys) from jsonb_object_keys(_column) as keys)
  );
end;
$$ language plpgsql stable security definer set search_path to pg_catalog, public, pg_temp;

-- Used to validate that a given jsonb object does not contain null values
-- We use anyelement here, since question data is defined as translated_field[]
-- where translated_field is a custom domain whose underlying type is jsonb.
-- Postgresql would not accept app_public.validate_jsonb_no_nulls(data translated_field[])
-- function calls without anyelement. For the same reason to_jsonb is used
-- to cast the input into jsonb.
create function app_public.validate_jsonb_no_nulls(input anyelement)
  returns void as $$
declare
  value jsonb;
begin
  -- SQL null and JSONB null's are different so we have to use jsonb_typeof()
  -- More information: http://mbork.pl/2020-02-15_PostgreSQL_and_null_values_in_jsonb

  if jsonb_typeof(to_jsonb(input)) = 'null' then
    -- JSON null provided, invalid
    raise exception 'Invalid json data' using errcode = 'JSONN';
  elsif jsonb_typeof(to_jsonb(input)) = 'array' then
    -- jsonb_strip_nulls omits all object fields that have null values
    if jsonb_array_length(jsonb_strip_nulls(to_jsonb(input))) < 1 then
      -- Empty json '{}' provided, invalid
      raise exception 'Invalid json data' using errcode = 'JSONN';
    else
      -- Loop jsonb list to see if there are any JSON null's. If there are, raise exception.
      for value in select jsonb_array_elements from jsonb_array_elements(to_jsonb(input)) loop
        if jsonb_typeof(to_jsonb(value)) = 'null' then
          -- JSON null found in list, invalid
          raise exception 'Invalid json data' using errcode = 'JSONN';
        end if;
      end loop;
    end if;
  end if;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
comment on function app_public.validate_jsonb_no_nulls(input anyelement) is
  E'Validate that provided jsonb does not contain nulls.';

--! split: 0003-computed-columns.sql
/*
 * Get the user primary email as a computed column.
 */
create function app_public.users_primary_email(u app_public.users) returns citext as $$
  select email
    from app_public.user_emails
    where
      user_emails.user_id = u.id
      and u.id = app_public.current_user_id()
      and user_emails.is_primary = true;
$$ language sql stable security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_public.users_primary_email(u app_public.users) is
  E'Users primary email.';

--! split: 0004-domain-types.sql
/*
 * User-defined data type for easier handling of fields
 * with language support. The check_language constraint makes
 * sure that only valid data can can be inserted.
 *
 * Example usage:
 *
 * create table app_public.events(
 *  ...
 *  name translated_field,
 *  description translated_field,
 *  ...
 */
create domain translated_field as jsonb check (check_language(value));
comment on domain translated_field is
  E'A translated field.';


/*
 * Custom domain for name columns (first and last) to check that they don't
 * contain a space. This is to prevent registrations where you effectively don't
 * provide your name by entering spaces.  Can be null since claimRegistrationToken
 * mutation creates a registration where the names are null.
 */

create domain constrained_name as text null check (value !~ '\s');
comment on domain translated_field is
  E'A field which must not contain spaces';

--! split: 0010-event_categories.sql
/*
 * The event categories table is to categorize events and to enforce RLS policies
 * on events. For example, only the members of owner_organization_id organization
 * can see private event registration information (such as allergies) and update
 * event details.
 */
create table app_public.event_categories(
  id uuid primary key default gen_random_uuid(),
  name translated_field not null,
  description translated_field not null,
  owner_organization_id uuid not null references app_public.organizations on delete cascade,
  color text,

  created_by uuid references app_public.users on delete set null,
  updated_by uuid references app_public.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()

  constraint _cnstr_check_color_hex check (color ~* '^#[a-f0-9]{6}$')
);
alter table app_public.event_categories enable row level security;

-- Indices
create index on app_public.event_categories(owner_organization_id);
create index on app_public.event_categories(created_by);
create index on app_public.event_categories(updated_by);
create index on app_public.event_categories(name);

-- Triggers
create trigger _100_timestamps
  before insert or update on app_public.event_categories for each row
  execute procedure app_private.tg__timestamps();

create trigger _200_ownership_info
  before insert or update on app_public.event_categories for each row
  execute procedure app_private.tg__ownership_info();

-- Comments
comment on table app_public.event_categories is
  E'Table for event categories.';
comment on column app_public.event_categories.id is
  E'Unique identifier for the event category.';
comment on column app_public.event_categories.name is
  E'Name of the event category.';
comment on column app_public.event_categories.description is
  E'Short description of the event category.';
comment on column app_public.event_categories.color is
  E'Color color the event category.';
comment on column app_public.event_categories.owner_organization_id is
  E'Identifier of the organizer.';

-- RLS policies and grants
create policy select_all on app_public.event_categories for select using (true);
create policy manage_admin on app_public.event_categories for all using(app_public.current_user_is_admin());
create policy manage_organization on app_public.event_categories for all using(app_public.current_user_is_owner_organization_member(owner_organization_id));

grant
  select,
  insert (name, description, color, owner_organization_id),
  update (name, description, color, owner_organization_id),
  delete
on app_public.event_categories to :DATABASE_VISITOR;

--! split: 0011-events.sql
/*
 * The events table stores events that a user of the application can register to.
 * Events can either be upcoming, open to registration or closed.
 */
create table app_public.events(
  id uuid primary key default gen_random_uuid(),
  -- Slug should be unique, but app_public.update_event custom mutation
  -- didn't work with the unique constraint. No idea why...
  slug citext not null unique,
  name translated_field not null,
  description translated_field not null,
  location text not null,
  event_start_time timestamptz not null,
  event_end_time timestamptz not null,
  registration_start_time timestamptz not null,
  registration_end_time timestamptz not null,
  is_highlighted boolean not null default false,
  is_draft boolean not null default true,
  header_image_file text,
  open_quota_size smallint not null,
  owner_organization_id uuid not null references app_public.organizations on delete cascade,
  category_id uuid not null references app_public.event_categories on delete set null,

  created_by uuid references app_public.users on delete set null,
  updated_by uuid references app_public.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()

  constraint _cnstr_check_event_time check(event_start_time < event_end_time)
  constraint _cnstr_check_event_registration_time check(registration_start_time < registration_end_time)
  constraint _cnstr_check_registration_end_before_event_start check(registration_end_time < event_start_time)
  constraint _cnstr_check_events_open_quota_size check (open_quota_size >= 0)
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
create index on app_public.events(is_highlighted);
create index on app_public.events(created_by);
create index on app_public.events(updated_by);

-- Triggers
create trigger _100_timestamps
  before insert or update on app_public.events for each row
  execute procedure app_private.tg__timestamps();

create trigger _200_ownership_info
  before insert or update on app_public.events for each row
  execute procedure app_private.tg__ownership_info();

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
  E'@unique\nSlug for the event.';
comment on column app_public.events.description is
  E'Description of the event.';
comment on column app_public.events.location is
  E'Event location.';
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
comment on column app_public.events.open_quota_size is
  E'Size of the open quota for the event.';
comment on column app_public.events.owner_organization_id is
  E'Identifier of the event organizer';
comment on column app_public.events.category_id is
  E'Identifier of a related event category.';

-- RLS policies and grants
-- Don't allow querying draft events
create policy select_all on app_public.events for select using (is_draft is false);
create policy manage_admin on app_public.events for all using(app_public.current_user_is_admin());
create policy manage_organization on app_public.events for all using(app_public.current_user_is_owner_organization_member(owner_organization_id));

grant
  select,
  insert (name, slug, description, location, event_start_time, event_end_time, registration_start_time, registration_end_time, is_highlighted, is_draft, header_image_file, open_quota_size, owner_organization_id, category_id),
  update (name, slug, description, location, event_start_time, event_end_time, registration_start_time, registration_end_time, is_highlighted, is_draft, header_image_file, open_quota_size, owner_organization_id, category_id),
  delete
on app_public.events to :DATABASE_VISITOR;

--! split: 0012-rls-helpers-2.sql
/*
 * We have to define this RLS policy helper function here since it uses the
 * events table. This function checks that the current user is a member of an
 * organization that has permissions to access information for a given event_id.
 */
create function app_public.current_user_has_event_permissions(event_id uuid) returns boolean as $$
  select exists (
    select 1
    from app_public.organization_memberships
    where
      user_id = app_public.current_user_id()
      and organization_id = (
        select owner_organization_id
        from app_public.events
        where events.id = event_id
      )
  )
$$ language sql stable security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_public.current_user_has_event_permissions(event_id uuid) is
  E'Returns true if the current user is a member of the owner organization for the event with the id passed as input, false otherwise.';

--! split: 0020-quotas.sql
/*
 * The quotas table defines quotas for event registrations. Once a quota is full
 * no more registrations are allowed and additional registrations are considered
 * to be in queue for the quota. There may be multiple quotas with different
 * sizes for a single event.
 */
create table app_public.quotas(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references app_public.events on delete cascade,
  position smallint not null check (position >= 0),
  title translated_field not null,
  size smallint not null check (size > 0),

  created_by uuid references app_public.users on delete set null,
  updated_by uuid references app_public.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app_public.quotas enable row level security;

-- Indices
create index on app_public.quotas(id);
create index on app_public.quotas(event_id);
create index on app_public.quotas(position);
create index on app_public.quotas(created_by);
create index on app_public.quotas(updated_by);

-- Triggers
create trigger _100_timestamps
  before insert or update on app_public.quotas for each row
  execute procedure app_private.tg__timestamps();

create trigger _200_ownership_info
  before insert or update on app_public.quotas for each row
  execute procedure app_private.tg__ownership_info();

-- Comments
comment on table app_public.quotas is
  E'Main table for registration quotas.';
comment on column app_public.quotas.event_id is
  E'Identifier of the event that this quota is for.';
comment on column app_public.quotas.position is
  E'Quota position. Used to order quotas.';
comment on column app_public.quotas.title is
  E'Title for the quota.';
comment on column app_public.quotas.size is
  E'Size of the quota.';

-- RLS policies and grants
create policy select_all on app_public.quotas for select using (true);
create policy manage_admin on app_public.quotas for all using(app_public.current_user_is_admin());
create policy manage_event on app_public.quotas for all using(app_public.current_user_has_event_permissions(event_id));

grant
  select,
  -- Allow update only on position, title and size. This means that once
  -- a quota is created it cannot be moved to another event.
  insert (event_id, position, title, size),
  update (position, title, size),
  delete
on app_public.quotas to :DATABASE_VISITOR;

--! split: 0021-quotas-crud-functions.sql
/*
 * These functions define create and update mutations that support operating on
 * multiple quotas at once.
 *
 * By default PostGraphile creates CRUD mutations for database tables
 * (https://www.graphile.org/postgraphile/crud-mutations/). We have omitted the
 * create, insert, update and delete mutations for the quotas table and use
 * these functions instead. The default mutations are omitted in
 * @app/server/postgraphile.tags.jsonc file.
 */
-- Input type for app_public.create_event_quotas
create type app_public.create_event_quotas as (
  position smallint,
  title jsonb,
  size smallint
);

create function app_public.create_event_quotas(
  event_id uuid,
  quotas app_public.create_event_quotas[]
)
returns app_public.quotas[] as $$
declare
  v_input app_public.create_event_quotas;
  v_quota app_public.quotas;
  v_ret app_public.quotas[] default '{}';
begin
  -- Check permissions
  call app_public.check_is_admin();

  -- Must specify at least one quota
  if (select array_length(quotas, 1)) is null then
    raise exception 'You must specify at least one quota' using errcode = 'DNIED';
  end if;

  -- Create quotas
  foreach v_input in array quotas loop
    insert into app_public.quotas(event_id, position, title, size)
      values (event_id, v_input.position, v_input.title, v_input.size)
      returning * into v_quota;

    v_ret := array_append(v_ret, v_quota);
  end loop;

  return v_ret;
end;
$$ language plpgsql volatile security invoker set search_path = pg_catalog, public, pg_temp;
-- We omit this function since app_public.create_event calls this function to
-- create the event, its quotas as well questions with a single mutation.
comment on function app_public.create_event_quotas(event_id uuid, quotas app_public.create_event_quotas[]) is
  E'@omit\nCreate multiple quotas at once.';

-- Input type for app_public.update_event_quotas
create type app_public.update_event_quotas as (
  id uuid,
  position smallint,
  title jsonb,
  size smallint
);

create function app_public.update_event_quotas(
  event_id uuid,
  quotas app_public.update_event_quotas[]
)
returns app_public.quotas[] as $$
#variable_conflict use_variable
declare
  v_quota_ids_to_delete uuid[];
  v_input app_public.update_event_quotas;
  v_quota app_public.quotas;
  v_ret app_public.quotas[] default '{}';
begin
  -- Check permissions
  call app_public.check_is_admin();

  -- Must specify at least one quota
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

  foreach v_input in array quotas loop
    if exists(select 1 from app_public.quotas where id = v_input.id) then
      -- Update existing event quotas by id
      update app_public.quotas
        set position = v_input.position, title = v_input.title, size = v_input.size
        where id = v_input.id
      returning * into v_quota;
    else
      -- Create new quotas that didn't exist before
      insert into app_public.quotas(event_id, position, title, size)
        values (event_id, v_input.position, v_input.title, v_input.size)
      returning * into v_quota;
    end if;

    v_ret := array_append(v_ret, v_quota);
  end loop;

  return v_ret;
end;
$$ language plpgsql volatile security invoker set search_path = pg_catalog, public, pg_temp;
-- We omit this function since app_public.update_event calls this function to
-- create the event, its quotas as well questions with a single mutation.
comment on function app_public.update_event_quotas(event_id uuid, quotas app_public.update_event_quotas[]) is
  E'@omit\nUpdate multiple quotas at once.';

--! split: 0030-event_questions.sql
/*
 * The events_questions table stores questions relating to an event.
 * There may be multiple questions of different types for a single
 * event. The questions are presented to the user during event
 * registration.
 */
create type app_public.question_type as enum (
  'TEXT',
  'RADIO',
  'CHECKBOX'
);

/*
 * Used as a check constraint to verify that a question is valid.
 * - When the type is TEXT, data should be null
 * - When the type is RADIO, the data should be an array of length 1
 * - When the type is CHECKBOX, the data should be of length 1 or greater
 * - Data should not contain nulls
 */
create function app_public.validate_question_data(type app_public.question_type, data translated_field[])
returns boolean as $$
declare
  err_context text;
begin
  if type = 'TEXT' then
    -- TEXT questions don't need to have any data associated with them
    -- since we simply render an input field. CHECKBOX and RADIO
    -- should have data (the answer options) associated with them.
    if data is null then
      return true;
    end if;

    return false;
  else

    -- Check that the provided jsonb data contains no null values
    perform app_public.validate_jsonb_no_nulls(data);

    -- RADIO and CHECKBOX must have data defined
    if data is null then
      return false;
    end if;

    return true;
  end if;
-- If validate_jsonb_no_nulls raises an exception, return false
exception when others then
  return false;
end;
$$ language plpgsql volatile security definer set search_path to pg_catalog, public, pg_temp;

create table app_public.event_questions(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references app_public.events(id) on delete cascade,
  position smallint not null,
  type app_public.question_type not null,
  label translated_field not null,
  is_required boolean not null default false,
  data translated_field[],

  created_by uuid references app_public.users on delete set null,
  updated_by uuid references app_public.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint _cnstr_validate_question_data check(app_public.validate_question_data(type, data))
);
alter table app_public.event_questions enable row level security;

-- Indices
create index on app_public.event_questions(event_id);
create index on app_public.event_questions(position);
create index on app_public.event_questions(created_by);
create index on app_public.event_questions(updated_by);

-- Triggers
create trigger _100_timestamps
  before insert or update on app_public.event_questions for each row
  execute procedure app_private.tg__timestamps();

create trigger _200_ownership_info
  before insert or update on app_public.event_questions for each row
  execute procedure app_private.tg__ownership_info();

-- Comments
comment on table app_public.event_questions is
  E'Main table for event questions.';
comment on column app_public.event_questions.id is
  E'Unique identifier for the event question.';
comment on column app_public.event_questions.event_id is
  E'Identifier of a related event.';
comment on column app_public.event_questions.position is
  E'Question position. Used to order question.';
comment on column app_public.event_questions.type is
  E'Question type (e.g. radio button, text, checkbox).';
comment on column app_public.event_questions.label is
  E'Question label.';
comment on column app_public.event_questions.is_required is
  E'If true, the question must be answered during event registration.';
comment on column app_public.event_questions.data is
  E'Question data.';

-- RLS policies and grants
create policy select_all on app_public.event_questions for select using (true);
create policy manage_admin on app_public.event_questions for all using(app_public.current_user_is_admin());
create policy manage_event on app_public.event_questions for all using(app_public.current_user_has_event_permissions(event_id));

grant
  select,
  insert (event_id, position, type, label, is_required, data),
  update (position, type, label, is_required, data),
  delete
on app_public.event_questions to :DATABASE_VISITOR;

--! split: 0031-event-questions-crud-functions.sql
/*
 * These functions define create and update mutations that support operating on
 * multiple event questions at once.
 *
 * By default PostGraphile creates CRUD mutations for database tables
 * (https://www.graphile.org/postgraphile/crud-mutations/). We have omitted the
 * create, insert, update and delete mutations for the questions table and use
 * these functions instead. The default mutations are omitted in
 * @app/server/postgraphile.tags.jsonc file.
 */
-- Input type for app_public.create_event_questions
create type app_public.create_event_questions as (
  position smallint,
  type app_public.question_type,
  label translated_field,
  is_required boolean,
  data translated_field[]
);

create function app_public.create_event_questions(
  event_id uuid,
  questions app_public.create_event_questions[]
)
returns app_public.event_questions[] as $$
declare
  v_input app_public.create_event_questions;
  v_question app_public.event_questions;
  v_ret app_public.event_questions[] default '{}';
begin
  -- Check permissions
  call app_public.check_is_admin();

  if questions is null then
    return null;
  end if;

  -- Create questions
  foreach v_input in array questions loop
    insert into app_public.event_questions(event_id, position, type, label, is_required, data)
      values (event_id, v_input.position, v_input.type, v_input.label, v_input.is_required, v_input.data)
      returning * into v_question;

    v_ret := array_append(v_ret, v_question);
  end loop;

  return v_ret;
end;
$$ language plpgsql volatile security invoker set search_path = pg_catalog, public, pg_temp;
-- We omit this function since app_public.create_event calls this function to
-- create the event, its quotas as well questions with a single mutation.
comment on function app_public.create_event_questions(event_id uuid, questions app_public.create_event_questions[]) is
  E'@omit\nCreate multiple questions at once.';

-- Input type for app_public.update_event_questions
create type app_public.update_event_questions as (
  id uuid,
  position smallint,
  type app_public.question_type,
  label translated_field,
  is_required boolean,
  data translated_field[]
);

create function app_public.update_event_questions(
  event_id uuid,
  questions app_public.update_event_questions[]
)
returns app_public.event_questions[] as $$
#variable_conflict use_variable
declare
  v_question_ids_to_delete uuid[];
  v_input app_public.update_event_questions;
  v_question app_public.event_questions;
  v_ret app_public.event_questions[] default '{}';
begin
  -- Check permissions
  call app_public.check_is_admin();

  select array(
    select id from app_public.event_questions as q
    where q.event_id = event_id
    and q.id not in (select id from unnest(questions))
  )
  into v_question_ids_to_delete;

  -- Delete existing event questions that were not supplied
  -- as input to this function
  delete from app_public.event_questions as q
    where q.id = any(v_question_ids_to_delete);

  foreach v_input in array questions loop
    if exists(select 1 from app_public.event_questions where id = v_input.id) then
      -- Update existing event questions by id
      update app_public.event_questions
        set position = v_input.position, type = v_input.type, label = v_input.label, is_required = v_input.is_required, data = v_input.data
        where id = v_input.id
      returning * into v_question;
    else
      -- Create new questions that didn't exist before
      insert into app_public.event_questions(event_id, position, type, label, is_required, data)
        values (event_id, v_input.position, v_input.type, v_input.label, v_input.is_required, v_input.data)
      returning * into v_question;
    end if;

    v_ret := array_append(v_ret, v_question);
  end loop;

  return v_ret;
end;
$$ language plpgsql volatile security invoker set search_path = pg_catalog, public, pg_temp;
-- We omit this function since app_public.update_event calls this function to
-- create the event, its quotas as well questions with a single mutation.
comment on function app_public.update_event_questions(event_id uuid, questions app_public.update_event_questions[]) is
  E'@omit\nUpdate multiple questions at once.';

--! split: 0040-registration-triggers.sql
/*
 * This trigger is used to validate inserts on app_public.registrations. The
 * trigger makes sure that only valid registrations can be inserted into the
 * database. That is, the related event is open to registrations and all required
 * questions are answered.
 */
create function app_public.validate_registration_answers(event_id uuid, required_question_ids uuid[], answers jsonb default null)
  returns void as $$
declare
  v_question app_public.event_questions;
  v_question_id uuid;
  v_answers jsonb;
begin
  -- Check that all required question id's are contained as top level keys in answers
  if not answers ?& required_question_ids::text[] then
    raise exception '' using errcode = 'RQRED';
  end if;

  -- Loop event answers and check that required questions have been answered
  -- It isn't very simple to verify that no nulls are present in jsonb...
  -- We do this with the validate_jsonb_no_nulls function.
  for v_question_id, v_answers in select * from jsonb_each(answers) loop
    select * into v_question from app_public.event_questions where id = v_question_id;

    -- If provided questino id is invalid, raise an error
    if v_question is null then
      raise exception '' using errcode = 'NTFND';
    end if;

    -- If provided answer is for a question
    if v_question.event_id != event_id then
      raise exception '' using errcode = 'EVTID';
    end if;

    -- Validate that the jsonb does not contain nulls
    perform app_public.validate_jsonb_no_nulls(v_answers);

    -- TEXT answers should be of type string
    if v_question.type = 'TEXT' and jsonb_typeof(v_answers) != 'string' then
      raise exception '' using errcode = 'NVLID';
    end if;

    -- RADIO answers should be of type string
    if v_question.type = 'RADIO' and jsonb_typeof(v_answers) != 'string' then
      raise exception '' using errcode = 'NVLID';
    end if;

    -- TEXT answers should be of type string
    if v_question.type = 'CHECKBOX' and jsonb_typeof(v_answers) != 'array' then
      raise exception '' using errcode = 'NVLID';
    end if;

  end loop;
-- If validate_jsonb_no_nulls raises an exception, return a more suitable error message
exception when others then
  if sqlstate = 'RQRED' then
    raise exception 'Required question not answered.' using errcode = 'NVLID';
  elsif sqlstate = 'NTFND' then
    raise exception 'Invalid answer, related question not found.' using errcode = 'NVLID';
  elsif sqlstate = 'EVTID' then
    raise exception 'Invalid answer, question is for another event.' using errcode = 'NVLID';
  elsif sqlstate = 'JSONN' or sqlstate = 'NVLID' then
    raise exception 'Invalid answer data to question of type: %.', v_question.type using errcode = 'NVLID';
  else
    raise exception 'Unknown error. % %', sqlstate, sqlerrm using errcode = 'FFFFF';
  end if;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
comment on function app_public.validate_registration_answers(event_id uuid, required_question_ids uuid[], answers jsonb) is
  E'Validate registration answers.';

create function app_private.tg__registration_is_valid() returns trigger as $$
declare
  v_event app_public.events;
  v_event_signup_open boolean;
  v_required_question_ids uuid[];
begin
  select * into v_event from app_public.events where id = NEW.event_id;
  v_event_signup_open := (select app_public.events_signup_open(v_event));

  if v_event_signup_open is false then
    raise exception 'Event registration is not open.' using errcode = 'DNIED';
  end if;

  v_required_question_ids := array(select id from app_public.event_questions where event_id = NEW.event_id and is_required = TRUE);
  perform app_public.validate_registration_answers(NEW.event_id, v_required_question_ids, NEW.answers);

  return NEW;
end;
$$ language plpgsql volatile set search_path to pg_catalog, public, pg_temp;
comment on function app_private.tg__registration_is_valid() is
  E'This trigger validates that a registration is valid. That is, the related event is open to registrations.';

--! split: 0041-registrations.sql
/*
 * The registrations table stores event registrations.
 */
create table app_public.registrations(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references app_public.events on delete cascade,
  quota_id uuid not null references app_public.quotas on delete no action,
  first_name constrained_name,
  last_name constrained_name,
  email citext null check (email ~ '[^@]+@[^@]+\.[^@]+'),
  answers jsonb,
  is_finished boolean not null default false,

  created_by uuid references app_public.users on delete set null,
  updated_by uuid references app_public.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (email, event_id)
);
alter table app_public.registrations enable row level security;

-- Indices
create index on app_public.registrations(event_id);
create index on app_public.registrations(quota_id);
create index on app_public.registrations(created_by);
create index on app_public.registrations(updated_by);
create index on app_public.registrations(created_at);

-- Triggers
create trigger _100_timestamps
  before insert or update on app_public.registrations for each row
  execute procedure app_private.tg__timestamps();

create trigger _200_ownership_info
  before insert or update on app_public.registrations for each row
  execute procedure app_private.tg__ownership_info();

create trigger _300_registration_is_valid
  before insert on app_public.registrations for each row
  execute procedure app_private.tg__registration_is_valid();

create trigger _400_send_registration_email
  -- Send email upon successful registration. We run this trigger on update because
  -- the registration is initially created with claim_registration_token and we
  -- don't know the users email at that point. The registration__send_confirmation_email
  -- task validates that only send one email per registration. This is tracked
  -- in app_private.registration_secrets.confirmation_email_sent.
  after update on app_public.registrations
  for each row execute procedure app_private.tg__add_job('registration__send_confirmation_email');

create trigger _500_gql_registration_updated
  -- Expose new registrations via a GraphQl subscription. Used for live updating
  -- views in the frontend application.
  after insert or update or delete on app_public.registrations
  for each row
  execute procedure app_public.tg__graphql_subscription(
    'registrationUpdated', -- the "event" string, useful for the client to know what happened
    'graphql:eventRegistrations:$1', -- the "topic" the event will be published to, as a template
    'event_id' -- If specified, `$1` above will be replaced with NEW.id or OLD.id from the trigger.
  );

-- Computed columns (https://www.graphile.org/postgraphile/computed-columns/)
create function app_public.registrations_full_name(registration app_public.registrations)
returns text as $$
  select registration.first_name || ' ' || registration.last_name
$$ language sql stable;
comment on function app_public.registrations_full_name(registration app_public.registrations) is
  E'Returns the full name of a registered person.';
grant execute on function app_public.registrations_full_name(registration app_public.registrations) to :DATABASE_VISITOR;

create or replace function app_public.registrations_email(registration app_public.registrations)
  returns text as $$
begin
  if
    app_public.current_user_id() = registration.created_by or
    app_public.current_user_is_admin()
  then
    -- Don't obfuscate email for the user that created the registration
    -- Dont obfuscate email for admin users
    return registration.email;
  else
    -- Obfuscate email for all other cases
    return '***';
  end if;
end;
$$ language plpgsql stable set search_path to pg_catalog, public, pg_temp;
comment on function app_public.registrations_email(registration app_public.registrations) is
  E'Email address of the person registered to an event.';
grant execute on function app_public.registrations_email(registration app_public.registrations) to :DATABASE_VISITOR;

create type app_public.registration_status as enum (
  'IN_QUOTA',
  'IN_QUEUE',
  'IN_OPEN_QUOTA'
);

create view app_public.registrations_status_and_position as
  with cte1 as (
    select
      r.id,
      size,
      e.id as event_id,
      q.id as quota_id,
      e.open_quota_size,
      r.created_at,
      row_number() over (partition by r.quota_id order by r.created_at asc) as tmp_pos_quota
    from app_public.registrations r
    left join app_public.quotas q
      on r.quota_id = q.id
    left join app_public.events e
      on r.event_id = e.id
  ), cte2 as (
    select
      tmp.*,
      row_number() over (partition by event_id, tmp_status order by created_at asc) as tmp_pos_status
    from (
      select
        *,
        case
          when tmp_pos_quota <= size then 'IN_QUOTA'::text
          else 'OPEN_OR_QUEUE'::text
        end as tmp_status
      from cte1
    ) as tmp
  ), cte3 as (
    select
      *,
      case
        when tmp_status = 'OPEN_OR_QUEUE'::text and tmp_pos_status <= open_quota_size then 'IN_OPEN_QUOTA'::app_public.registration_status
        when tmp_status = 'OPEN_OR_QUEUE'::text then 'IN_QUEUE'::app_public.registration_status
        else 'IN_QUOTA'::app_public.registration_status
      end as status
    from cte2
  ) select
      id,
      status,
      case
        -- row_number() returns bigint but we cast it to integer to avoid
        -- introducing another type to our GraphQL API. Besides, we are not
        -- expecting to have that many registrations in the system.
        when status = 'IN_QUOTA'::app_public.registration_status then cast(row_number() over (partition by quota_id, status order by created_at asc) as integer)
        else cast(row_number() over (partition by event_id, status order by created_at asc) as integer)
      end as position
    from cte3;
comment on view registrations_status_and_position is
  E'Rank and position of registrations.';
grant select on app_public.registrations_status_and_position to :DATABASE_VISITOR;

create function app_public.registrations_status(registration app_public.registrations)
returns app_public.registration_status as $$
  select status from app_public.registrations_status_and_position where id = registration.id;
$$ language sql stable;
comment on function app_public.registrations_status(registration app_public.registrations) is
  E'@sortable\n@filterable\nReturns the status of the registration.';
grant execute on function app_public.registrations_status(registration app_public.registrations) to :DATABASE_VISITOR;

create function app_public.registrations_position(registration app_public.registrations)
returns integer as $$
  select position from app_public.registrations_status_and_position where id = registration.id;
$$ language sql stable;
comment on function app_public.registrations_position(registration app_public.registrations) is
  E'@sortable\n@filterable\nReturns the position of the registration.';
grant execute on function app_public.registrations_position(registration app_public.registrations) to :DATABASE_VISITOR;

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
  E'First name of the person registered to an event.';
comment on column app_public.registrations.last_name is
  E'Last name of the person registered to an event.';
comment on column app_public.registrations.email is
  E'@omit\nEmail address of the person registered to an event.';
comment on column app_public.registrations.answers is
  E'Answers to event questions.';
comment on column app_public.registrations.is_finished is
  E'True if the registration is completed succesfully.';

-- RLS policies and grants
create policy select_all on app_public.registrations for select using (true);
create policy update_all on app_public.registrations for update using (true);
create policy manage_admin on app_public.registrations for all using(app_public.current_user_is_admin());

grant
  select,
  insert (event_id, quota_id, first_name, last_name, email, answers, is_finished),
  -- Don't allow updating an existing registration to another event or quota
  -- Don't allow updating registration email
  update (first_name, last_name, answers),
  delete
on app_public.registrations to :DATABASE_VISITOR;

--! split: 0042-registration_secrets.sql
/*
 * The registrations_secrets table stores event secrets related to event
 * registrations.
 *
 * In order to create a registration a registration_token (obtained via the
 * claim_registration_token function) must be provided. To update a registration
 * an update_token must be provided. Upon registration, an email containing an
 * update_token is sent to the user.
 */
create table app_private.registration_secrets(
  id uuid primary key default gen_random_uuid(),
  registration_token text default encode(gen_random_bytes(7), 'hex'),
  update_token text default encode(gen_random_bytes(7), 'hex'),
  confirmation_email_sent boolean not null default false,

  -- When a registration/event/quota is deleted, also delete the secrets
  registration_id uuid null references app_public.registrations on delete cascade,
  event_id uuid not null references app_public.events on delete cascade,
  quota_id uuid not null references app_public.quotas on delete no action,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(registration_token),
  unique(update_token)
);
alter table app_private.registration_secrets enable row level security;

-- Triggers
create trigger _100_timestamps
  before insert or update on app_private.registration_secrets for each row
  execute procedure app_private.tg__timestamps();

-- Indices
create index on app_private.registration_secrets(event_id);
create index on app_private.registration_secrets(registration_id);

-- Comments
comment on table app_private.registration_secrets is
  E'The contents of this table should never be visible to the user. Contains data related to event registrations.';

--! split: 0043-registrations-admin-functions.sql
/*
 * These functions are used to manage registrations via the admin panel.
 */
create function app_public.admin_update_registration(id uuid)
returns text as $$
declare
  v_registration_secret app_private.registration_secrets;
  v_required_question_ids uuid[];
begin
  if not app_public.current_user_is_admin() then
    raise exception 'Acces denied. Only admins are allowed to use this mutation.' using errcode = 'DNIED';
  end if;

  select * into v_registration_secret
    from app_private.registration_secrets
    where registration_id = admin_update_registration.id;

  if v_registration_secret is null then
    raise exception 'Registration was not found.' using errcode = 'NTFND';
  end if;

  return v_registration_secret.update_token;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
comment on function app_public.admin_update_registration(id uuid) is
  E'Mutation only accessible to admin users. Allows updating a registration via the admin panel.';

create function app_public.admin_delete_registration(id uuid)
returns boolean as $$
declare
  v_registration_id uuid;
begin
  if not app_public.current_user_is_admin() then
    raise exception 'Acces denied. Only admins are allowed to use this mutation.' using errcode = 'DNIED';
  end if;

  -- Delete registration and associated secrets (foreign key has on delete)
  delete from app_public.registrations r where r.id = admin_delete_registration.id returning r.id into v_registration_id;

  if v_registration_id is null then
    raise exception 'Registration was not found.' using errcode = 'NTFND';
  end if;

  return true;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
comment on function app_public.admin_delete_registration(id uuid) is
  E'Mutation only accessible to admin users. Allows deleting a registration via the admin panel. In contrast to deleteRegistration, adminDeleteRegistration also allows deleting a registrations once the event signup has closed.';

--! split: 0044-registrations-crud-functions.sql
/*
 * These functions define create, update and delete mutations for event
 * registrations. This allows us to specify additional conditions in order to
 * operate on registrations. For example, in order to create a registration a
 * valid registration token must be provided. Similarly, to update or delete a
 * registration a valid update token must be provided. The regitrationToken is
 * obtained via the claim_registration_token function and the update token is
 * emailed to the user on successful event registration.
 *
 * By default PostGraphile creates CRUD mutations for database tables
 * (https://www.graphile.org/postgraphile/crud-mutations/). We have omitted the
 * create, insert, update and delete mutations for the registrations table and
 * use these functions instead. The default mutations are omitted in
 * @app/server/postgraphile.tags.jsonc file.
 */
create function app_public.create_registration(
  "registrationToken" text,
  "eventId" uuid,
  "quotaId" uuid,
  "firstName" text,
  "lastName" text,
  email citext,
  answers jsonb default null
)
returns app_public.registrations as $$
declare
  v_registration app_public.registrations;
  v_registration_id uuid;
  v_quota app_public.quotas;
  v_event app_public.events;
  v_event_signup_open boolean;
  v_required_question_ids uuid[];
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

  -- If the registration is not open yet, prevent event registration.
  -- This is double validated in the _200_registration_is_valid trigger.
  v_event_signup_open := (select app_public.events_signup_open(v_event));
  if not v_event_signup_open then
    raise exception 'Event registration is not open.' using errcode = 'DNIED';
  end if;

  -- Get registration id matching registration token
  select registration_id into v_registration_id
  from app_private.registration_secrets
  where registration_token = "registrationToken"
    and event_id = "eventId"
    and quota_id = "quotaId";

  -- If the provided token does not exist or is not valid for the specified event
  -- prevent event registration
  if v_registration_id is null then
    raise exception 'Registration token was not valid. Please reload the page.' using errcode = 'DNIED';
  end if;

  -- If the registration doesn't provide answers to all of the required questions it is invalid.
  -- This is double validated in the _200_registration_is_valid trigger.
  v_required_question_ids := array(select id from app_public.event_questions where event_id = "eventId" and is_required = True);
  perform app_public.validate_registration_answers("eventId", v_required_question_ids, answers);

  -- Update registration that was created by calling claim_registration_token
  update app_public.registrations
    set
      first_name = "firstName",
      last_name = "lastName",
      email = create_registration.email,
      -- strip nulls just in case
      answers = jsonb_strip_nulls(create_registration.answers),
      is_finished = true
    where id = v_registration_id
  returning
    * into v_registration;

  if v_registration.id is null then
    raise exception 'Registration failed. Registration matching token was not found.' using errcode = 'NTFND';
  end if;

  -- Set the used token to null and set registration_id
  update app_private.registration_secrets
    set registration_token = null, registration_id = v_registration.id
    where registration_secrets.registration_token = "registrationToken";

  return v_registration;
exception when unique_violation then
  -- We would like to do the line below but PostgreSQL transaction handling does not
  -- allow it: https://stackoverflow.com/questions/53276032/commit-and-rollback-inside-the-postgres-function
  --
  -- PostgreSQL 11 has procedures which support this use case, but Postgraphile does not support
  -- them and we cannot call a procedure that does a COMMIT or a ROLLBACK from a function:
  --
  -- https://www.postgresql.org/docs/current/plpgsql-transactions.html
  -- https://www.postgresql.org/message-id/d318108f-313f-058b-5670-c4c20132733d%402ndquadrant.com
  --
  -- delete from app_public.registrations where id = v_registration_id;
  --
  -- Instead, we just let the worker task registration__delete_unfinished_registrations
  -- cleanup unfinished registrations after the timeout.
  raise exception 'A registration with email % already exists for this event.', create_registration.email using errcode = 'DNIED';
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
comment on function app_public.create_registration("registrationToken" text, "eventId" uuid, "quotaId" uuid, "firstName" text, "lastName" text, email citext, answers jsonb) is
  E'Register to an event. Checks that a valid registration token was suplied.';

create function app_public.update_registration(
  "updateToken" text,
  "firstName" text,
  "lastName" text,
  answers jsonb default null
)
returns app_public.registrations as $$
declare
  v_registration_secret app_private.registration_secrets;
  v_registration app_public.registrations;
  v_required_question_ids uuid[];
begin
  select * into v_registration_secret
    from app_private.registration_secrets
    where update_token = "updateToken";

  if v_registration_secret is null then
    raise exception 'Registration matching token was not found.' using errcode = 'NTFND';
  end if;

  -- If the registration doesn't provide answers to all of the required questions it is invalid.
  -- This is double validated in the _200_registration_is_valid trigger.
  v_required_question_ids := array(select id from app_public.event_questions where event_id = v_registration_secret.event_id and is_required = True);
  perform app_public.validate_registration_answers(v_registration_secret.event_id, v_required_question_ids, answers);

  update app_public.registrations
    set first_name = "firstName", last_name = "lastName", answers = update_registration.answers
    where id = v_registration_secret.registration_id
  returning
    * into v_registration;

  return v_registration;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
comment on function app_public.update_registration("updateToken" text, "firstName" text, "lastName" text, answers jsonb) is
  E'Update event registration. Checks that a valid update token was suplied.';

create function app_public.delete_registration("updateToken" text)
returns boolean as $$
declare
  v_registration_id uuid;
  v_registration app_public.registrations;
  v_event app_public.events;
begin
  select registration_id into v_registration_id
    from app_private.registration_secrets
    where update_token = "updateToken";

  if v_registration_id is null then
    raise exception 'Registration matching token was not found.' using errcode = 'NTFND';
  end if;

  select * into v_registration from app_public.registrations where id = v_registration_id;
  select * into v_event from app_public.events where id = v_registration.event_id;

  if (v_event is null) or not (select app_public.events_signup_open(v_event)) then
    raise exception 'Deleting a registration after event signup has closed is not allowed. Please contact the event organizers.' using errcode = 'DNIED';
  end if;

  -- Delete registration and associated secrets (foreign key has on delete)
  delete from app_public.registrations where id = v_registration_id;

  return true;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
comment on function app_public.delete_registration("updateToken" text) is
  E'Delete event registration.';

create function app_public.registration_by_update_token("updateToken" text)
returns app_public.registrations as $$
declare
  v_registration_id uuid;
  v_registration app_public.registrations;
begin
  select registration_id into v_registration_id
    from app_private.registration_secrets
    where update_token = "updateToken";

  if v_registration_id is null then
    return null;
  end if;

  select * into v_registration
    from app_public.registrations
    where id = v_registration_id;

  return v_registration;
end;
$$ language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp;
grant execute on function  app_public.registration_by_update_token("updateToken" text) to :DATABASE_VISITOR;

comment on function app_public.registration_by_update_token("updateToken" text) is
  E'Get registration by update token.';

--! split: 0045-registration_secrets-functions.sql
/*
 * These functions are used to create registration secrets that are required
 * to create, update or delete registrations.
 */
-- Output type for app_public.claim_registration_token
create type app_public.claim_registration_token_output as (
  registration_token text,
  update_token text
);

create function app_public.claim_registration_token(event_id uuid, quota_id uuid)
returns app_public.claim_registration_token_output as $$
#variable_conflict use_column
declare
  v_output app_public.claim_registration_token_output;
  v_registration_id uuid;
begin
  -- Check that the event exists
  if not exists(
    select 1
    from app_public.events
    where id = claim_registration_token.event_id
  ) then
    raise exception 'Invalid event id.' using errcode = 'NTFND';
  end if;

  -- Check that the quota exists
  if not exists(
    select 1
    from app_public.quotas
    where
      id = claim_registration_token.quota_id
      and event_id = claim_registration_token.event_id
  ) then
    raise exception 'Invalid event or quota id.' using errcode = 'NTFND';
  end if;

  -- Create a new registration secret
  insert into app_private.registration_secrets(event_id, quota_id)
    values (event_id, quota_id)
  returning
    registration_token, update_token into v_output;

  -- Create a registration. This means that a spot in the specified event and
  -- quota is reserved for a user when this function is called. The user can
  -- then proceed to enter their information at their own pace without worrying
  -- that the quota would already be filled by the time they finished.
  insert into app_public.registrations(event_id, quota_id)
    values (event_id, quota_id)
  returning
    id into v_registration_id;

  -- Set registration_id to the corresponding row in registration_secrets table
  update app_private.registration_secrets
    set registration_id = v_registration_id
    where registration_token = v_output.registration_token;

  return v_output;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
comment on function app_public.claim_registration_token(event_id uuid, quota_id uuid) is
  E'Generates a registration token that must be provided during registration. The token is used to prevent F5-wars.';

--! split: 0099-events-crud-functions.sql
/*
 * These functions define create and update mutations that are used
 * to create events. The same mutations also create quotas and
 * questions related to the event.
 */
-- Input type for app_public.create_event
create type app_public.event_input as (
  slug citext,
  name translated_field,
  description translated_field,
  location text,
  event_start_time timestamptz,
  event_end_time timestamptz,
  registration_start_time timestamptz,
  registration_end_time timestamptz,
  is_highlighted boolean,
  is_draft boolean,
  header_image_file text,
  open_quota_size smallint,
  owner_organization_id uuid,
  category_id uuid
);

create function app_public.create_event(
  event app_public.event_input,
  quotas app_public.create_event_quotas[],
  questions app_public.create_event_questions[] default null
)
returns app_public.events as $$
#variable_conflict use_variable
declare
  v_event app_public.events;
begin
  -- Check permissions
  call app_public.check_is_admin();

  -- Create the event
  insert into app_public.events(
    slug,
    name,
    description,
    location,
    event_start_time,
    event_end_time,
    registration_start_time,
    registration_end_time,
    is_highlighted,
    is_draft,
    header_image_file,
    open_quota_size,
    owner_organization_id,
    category_id
  )
  values (
    event.slug,
    event.name,
    event.description,
    event.location,
    event.event_start_time,
    event.event_end_time,
    event.registration_start_time,
    event.registration_end_time,
    event.is_highlighted,
    event.is_draft,
    event.header_image_file,
    event.open_quota_size,
    event.owner_organization_id,
    event.category_id
  )
  returning * into v_event;

  -- Create quotas and questions
  perform * from app_public.create_event_quotas(v_event.id, quotas);
  perform * from app_public.create_event_questions(v_event.id, questions);

  return v_event;
end;
$$ language plpgsql volatile security invoker set search_path = pg_catalog, public, pg_temp;
comment on function app_public.create_event(event app_public.event_input, quotas app_public.create_event_quotas[], questions app_public.create_event_questions[]) is
  E'Create an event as well as any related quotas and questions with one mutation.';

create function app_public.update_event(
  id uuid,
  event app_public.event_input,
  quotas app_public.update_event_quotas[],
  questions app_public.update_event_questions[] default null
)
returns app_public.events as $$
#variable_conflict use_column
declare
  v_event app_public.events;
begin
  -- Check permissions
  call app_public.check_is_admin();

  -- Create the event
  update app_public.events
    set
      slug = coalesce(event.slug, slug),
      name = coalesce(event.name, name),
      description = coalesce(event.description, description),
      location = coalesce(event.location, location),
      event_start_time = coalesce(event.event_start_time, event_start_time),
      event_end_time = coalesce(event.event_end_time, event_end_time),
      registration_start_time = coalesce(event.registration_start_time, registration_start_time),
      registration_end_time = coalesce(event.registration_end_time, registration_end_time),
      is_highlighted = coalesce(event.is_highlighted, is_highlighted),
      is_draft = coalesce(event.is_draft, is_draft),
      header_image_file = coalesce(event.header_image_file, header_image_file),
      open_quota_size = coalesce(event.open_quota_size, open_quota_size),
      owner_organization_id = coalesce(event.owner_organization_id, owner_organization_id),
      category_id = coalesce(event.category_id, category_id)
    where id = update_event.id
  returning * into v_event;

  -- Update quotas and questions
  perform * from app_public.update_event_quotas(id, quotas);
  perform * from app_public.update_event_questions(id, questions);

  return v_event;
end;
$$ language plpgsql volatile security invoker set search_path = pg_catalog, public, pg_temp;
comment on function app_public.update_event(id uuid, event app_public.event_input, quotas app_public.update_event_quotas[], questions app_public.update_event_questions[]) is
  E'Updates an event as well as any related quotas and questions with one mutation.';
