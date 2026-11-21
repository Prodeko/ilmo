--! Previous: sha1:43ae0b3e314d8775763bfdb7015fb858183d247d
--! Hash: sha1:14afad22610b41b44aa9252558421a99ebb91c56

--! split: 1-feature-flags.sql
/*
 * Feature flags and the developer permission.
 *
 * A flag is a row in `app_public.feature_flags`, inserted by the migration
 * that adds the gated feature. `app_public.feature_enabled(key)` is the
 * authoritative gate; a key without a row reads as off. Only developers (users
 * who are both admins and developers) can read the table or switch a flag, and
 * every switch is recorded in `app_private.feature_flag_events`.
 */

drop function if exists app_public.feature_flag_events(text);
drop function if exists app_private.set_feature_available(text, boolean);
drop function if exists app_public.set_feature_flag(text, app_public.feature_state);
drop function if exists app_public.enabled_features();
drop function if exists app_public.feature_enabled(text);
drop table if exists app_private.feature_flag_events;
drop table if exists app_public.feature_flags;
drop type if exists app_public.feature_state;
drop procedure if exists app_public.check_is_developer();
drop function if exists app_public.current_user_is_developer();
alter table app_public.users drop column if exists is_developer;

/*
 * Developer permission. Mirrors `is_admin`: readable like the rest of the
 * user row, never writable through the visitor role (the column is not in the
 * `grant update` column list of `app_public.users`).
 */

alter table app_public.users add column is_developer boolean not null default false;

comment on column app_public.users.is_developer is
  E'If true and the user is also an admin, the user can manage feature flags.';

create function app_public.current_user_is_developer() returns boolean as $$
  select exists (
    select 1
    from app_public.users
    where
      id = app_public.current_user_id()
      and is_admin = true
      and is_developer = true)
$$ language sql stable security definer set search_path to pg_catalog, public, pg_temp;

comment on function app_public.current_user_is_developer() is
  E'Returns true if the current user is both an admin and a developer, false otherwise.';

create procedure app_public.check_is_developer() as $$
begin
  if not app_public.current_user_is_developer() then
    raise exception 'Access denied. Only developers are allowed to use this mutation.' using errcode = 'DNIED';
  end if;
end;
$$ language plpgsql;

/*
 * Flags.
 */

create type app_public.feature_state as enum ('off', 'admins_only', 'on');

comment on type app_public.feature_state is
  E'State of a feature flag: off for everyone, on for signed-in admins only, or on for everyone.';

create table app_public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  state app_public.feature_state not null default 'off',
  available boolean not null default true,
  description text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references app_public.users on delete set null,
  retired_at timestamptz
);
alter table app_public.feature_flags enable row level security;

create index on app_public.feature_flags(updated_by);

create policy select_developer on app_public.feature_flags
  for select using (app_public.current_user_is_developer());
grant select on app_public.feature_flags to :DATABASE_VISITOR;
-- NOTE: `insert`, `update` and `delete` are not granted. Rows are inserted by
-- migrations and changed through `set_feature_flag` and `set_feature_available`.

comment on table app_public.feature_flags is
  E'A feature that can be switched on or off at runtime. Rows are created by migrations.';
comment on column app_public.feature_flags.key is
  E'Identifier of the feature, as used in code.';
comment on column app_public.feature_flags.state is
  E'Who the feature is enabled for.';
comment on column app_public.feature_flags.available is
  E'False when the server lacks the configuration the feature needs; the feature then reads as off whatever its state.';
comment on column app_public.feature_flags.description is
  E'What the flag gates.';
comment on column app_public.feature_flags.updated_at is
  E'When the state was last changed.';
comment on column app_public.feature_flags.updated_by is
  E'Who last changed the state.';
comment on column app_public.feature_flags.retired_at is
  E'Set when the gates have been removed from code. A retired flag reads as on.';
comment on constraint feature_flags_updated_by_fkey on app_public.feature_flags is
  E'@omit many';

/*
 * Audit log of state changes. The key is not a foreign key so that the history
 * stays when a retired flag row is deleted.
 */

create table app_private.feature_flag_events (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  old_state app_public.feature_state not null,
  new_state app_public.feature_state not null,
  actor uuid references app_public.users on delete set null,
  created_at timestamptz not null default now()
);
alter table app_private.feature_flag_events enable row level security;

create index on app_private.feature_flag_events(key, created_at);
create index on app_private.feature_flag_events(actor);

comment on table app_private.feature_flag_events is
  E'One row per feature flag state change.';

/*
 * Gates.
 */

create function app_public.feature_enabled(key text) returns boolean as $$
  select exists (
    select 1
    from app_public.feature_flags as f
    where
      f.key = feature_enabled.key
      and (
        f.retired_at is not null
        or (
          f.available
          and (
            f.state = 'on'
            or (f.state = 'admins_only' and app_public.current_user_is_admin())
          )
        )
      ))
$$ language sql stable security definer set search_path to pg_catalog, public, pg_temp;

comment on function app_public.feature_enabled(key text) is
  E'@omit\nTrue when the feature is enabled for the current user. Unknown keys read as off.';

create function app_public.enabled_features() returns setof text as $$
  select f.key
  from app_public.feature_flags as f
  where app_public.feature_enabled(f.key)
  order by f.key;
$$ language sql stable security definer set search_path to pg_catalog, public, pg_temp;

comment on function app_public.enabled_features() is
  E'@simpleCollections only\nKeys of the features enabled for the current user.';

/*
 * Switching.
 */

create function app_public.set_feature_flag(key text, state app_public.feature_state)
returns app_public.feature_flags as $$
#variable_conflict use_variable
declare
  v_flag app_public.feature_flags;
  v_old_state app_public.feature_state;
begin
  call app_public.check_is_developer();

  select * into v_flag
  from app_public.feature_flags as f
  where f.key = key
  for update;

  if v_flag.key is null then
    raise exception 'Unknown feature flag "%".', key using errcode = 'NTFND';
  end if;

  if v_flag.retired_at is not null then
    raise exception 'Feature flag "%" is retired and cannot be changed.', key using errcode = 'DNIED';
  end if;

  if state <> 'off' and not v_flag.available then
    raise exception 'Feature flag "%" is not available: the server lacks the configuration it needs.', key using errcode = 'FTUNA';
  end if;

  if v_flag.state = state then
    return v_flag;
  end if;

  v_old_state = v_flag.state;

  update app_public.feature_flags as f
  set
    state = state,
    updated_at = now(),
    updated_by = app_public.current_user_id()
  where f.key = key
  returning * into v_flag;

  insert into app_private.feature_flag_events (key, old_state, new_state, actor)
  values (key, v_old_state, state, app_public.current_user_id());

  return v_flag;
end;
$$ language plpgsql volatile security definer set search_path to pg_catalog, public, pg_temp;

comment on function app_public.set_feature_flag(key text, state app_public.feature_state) is
  E'Changes the state of an existing feature flag. Only accessible to developers.';

create function app_private.set_feature_available(key text, available boolean) returns boolean as $$
  with updated as (
    update app_public.feature_flags as f
    set available = set_feature_available.available
    where f.key = set_feature_available.key
    returning 1
  )
  select exists (select 1 from updated);
$$ language sql volatile security definer set search_path to pg_catalog, public, pg_temp;

comment on function app_private.set_feature_available(key text, available boolean) is
  E'Records whether the server has the configuration a feature needs. Returns false for an unknown key. Does not change `updated_at`, which tracks state changes.';

/*
 * Audit log for the admin page.
 */

create function app_public.feature_flag_events(flag_key text default null)
returns table (
  id uuid,
  key text,
  old_state app_public.feature_state,
  new_state app_public.feature_state,
  actor_id uuid,
  actor_username text,
  actor_name text,
  created_at timestamptz
) as $$
begin
  -- Cannot use call app_public.check_is_developer(); in a non volatile function
  if not app_public.current_user_is_developer() then
    raise exception 'Access denied. Only developers are allowed to use this query.' using errcode = 'DNIED';
  end if;

  return query
    select e.id, e.key, e.old_state, e.new_state, e.actor, u.username::text, u.name, e.created_at
    from app_private.feature_flag_events as e
    left join app_public.users as u on u.id = e.actor
    where flag_key is null or e.key = flag_key
    order by e.created_at desc, e.id;
end;
$$ language plpgsql stable security definer set search_path to pg_catalog, public, pg_temp;

comment on function app_public.feature_flag_events(flag_key text) is
  E'@simpleCollections only\nFeature flag state changes, newest first, optionally for one key. Only accessible to developers.';
