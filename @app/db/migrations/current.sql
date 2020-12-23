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

grant select (event_id, token, created_at) on app_public.registration_tokens to :DATABASE_VISITOR;

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
  -- TODO: Rate limiting based on IP?
  -- So that people can't spam this endpoint and pass the
  -- tokens to their friends. Unlikely that someone would
  -- do this but it is possible.
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

grant select (event_id, firstname, lastname, quota, questions_public) on app_public.registrations to :DATABASE_VISITOR;

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
