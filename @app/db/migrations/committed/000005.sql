--! Previous: sha1:eafce160dd3a8ec859a47bc11b5c9117cc07fd8e
--! Hash: sha1:4f00de0a12fe4f8d48132d1d2169088bcef24109

--! split: 3-registration-reminders.sql
-- Telegram chat identifiers are only exposed to the server, never in GraphQL.
create table if not exists app_public.telegram_accounts (
  user_id uuid primary key references app_public.users(id) on delete cascade,
  chat_id bigint not null unique check (chat_id > 0),
  username text,
  created_at timestamptz not null default now()
);
comment on table app_public.telegram_accounts is E'@omit create,update,delete\nTelegram accounts linked by their owners.';
comment on column app_public.telegram_accounts.chat_id is E'@omit';
alter table app_public.telegram_accounts enable row level security;
drop policy if exists own_telegram_account on app_public.telegram_accounts;
create policy own_telegram_account on app_public.telegram_accounts
  using (user_id = app_public.current_user_id());
grant select on app_public.telegram_accounts to :DATABASE_VISITOR;

create table if not exists app_private.telegram_link_tokens (
  user_id uuid primary key references app_public.users(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null
);
revoke all on app_private.telegram_link_tokens from public;

create or replace function app_public.current_telegram_account()
returns app_public.telegram_accounts as $$
  select * from app_public.telegram_accounts where user_id = app_public.current_user_id();
$$ language sql stable;
grant execute on function app_public.current_telegram_account() to :DATABASE_VISITOR;

create or replace function app_public.request_telegram_link() returns text as $$
declare
  v_user uuid := app_public.current_user_id();
  v_token text := encode(public.gen_random_bytes(24), 'hex');
begin
  if v_user is null then
    raise exception 'Sign in to connect Telegram.' using errcode = 'LOGIN';
  end if;
  insert into app_private.telegram_link_tokens(user_id, token_hash, expires_at)
    values(v_user, public.digest(v_token, 'sha256'), now() + interval '15 minutes')
    on conflict (user_id) do update set token_hash = excluded.token_hash, expires_at = excluded.expires_at;
  return v_token;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
revoke all on function app_public.request_telegram_link() from public;
grant execute on function app_public.request_telegram_link() to :DATABASE_VISITOR;

-- Only trusted bot-update processing may consume a linking code.
create or replace function app_private.connect_telegram(token text, chat_id bigint, username text)
returns boolean as $$
#variable_conflict use_variable
declare
  v_user uuid;
begin
  if chat_id is null or chat_id <= 0 then return false; end if;
  delete from app_private.telegram_link_tokens t
    where t.token_hash = public.digest(token, 'sha256') and t.expires_at > clock_timestamp()
    returning t.user_id into v_user;
  if v_user is null then return false; end if;
  -- Do not silently move somebody else's Telegram chat to another account.
  if exists(select 1 from app_public.telegram_accounts a where a.chat_id = chat_id and a.user_id <> v_user) then
    return false;
  end if;
  insert into app_public.telegram_accounts(user_id, chat_id, username)
    values(v_user, chat_id, username)
    on conflict (user_id) do update set chat_id = excluded.chat_id, username = excluded.username;
  return true;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
revoke all on function app_private.connect_telegram(text, bigint, text) from public;

create table if not exists app_public.event_registration_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_public.users(id) on delete cascade,
  event_id uuid not null references app_public.events(id) on delete cascade,
  language text not null default 'fi' check (language in ('fi', 'en')),
  minutes_before integer not null default 30 check (minutes_before between 1 and 10080),
  delivery_method text not null default 'email' check (delivery_method in ('email', 'telegram', 'both')),
  email_sent_at timestamptz,
  telegram_sent_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, event_id)
);
alter table app_public.event_registration_reminders add column if not exists minutes_before integer not null default 30 check (minutes_before between 1 and 10080);
alter table app_public.event_registration_reminders add column if not exists delivery_method text not null default 'email' check (delivery_method in ('email', 'telegram', 'both'));
alter table app_public.event_registration_reminders add column if not exists email_sent_at timestamptz;
alter table app_public.event_registration_reminders add column if not exists telegram_sent_at timestamptz;
update app_public.event_registration_reminders set email_sent_at = sent_at where sent_at is not null and email_sent_at is null and delivery_method = 'email';
create index if not exists event_registration_reminders_event_id_idx
  on app_public.event_registration_reminders(event_id);

comment on table app_public.event_registration_reminders is E'@omit create,update\nRegistration reminders requested by the current user, before registration opens.';
alter table app_public.event_registration_reminders enable row level security;
drop policy if exists own_reminders on app_public.event_registration_reminders;
create policy own_reminders on app_public.event_registration_reminders
  using (user_id = app_public.current_user_id());
grant select, delete on app_public.event_registration_reminders to :DATABASE_VISITOR;

create or replace function app_private.schedule_registration_reminder(reminder_id uuid)
returns void as $$
declare
  v_due timestamptz;
  v_reminder app_public.event_registration_reminders;
  v_key text := 'registration-reminder:' || reminder_id::text;
begin
  select * into v_reminder from app_public.event_registration_reminders where id = reminder_id;
  select e.registration_start_time - make_interval(mins => v_reminder.minutes_before) into v_due
    from app_public.events e where e.id = v_reminder.event_id
      and v_reminder.sent_at is null and not e.is_draft and e.registration_start_time > now();
  if v_due is not null and v_reminder.delivery_method in ('email', 'both') and v_reminder.email_sent_at is null then
    perform graphile_worker.add_job('reminder__send_registration', json_build_object('id', reminder_id),
      run_at := greatest(now(), v_due), job_key := v_key);
  else
    perform graphile_worker.remove_job(v_key);
  end if;
  if v_due is not null and v_reminder.delivery_method in ('telegram', 'both') and v_reminder.telegram_sent_at is null then
    perform graphile_worker.add_job('reminder__send_telegram', json_build_object('id', reminder_id),
      run_at := greatest(now(), v_due), job_key := v_key || ':telegram', queue_name := 'telegram-reminders');
  else
    perform graphile_worker.remove_job(v_key || ':telegram');
  end if;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
revoke all on function app_private.schedule_registration_reminder(uuid) from public;

create or replace function app_private.tg__schedule_registration_reminder()
returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    perform graphile_worker.remove_job('registration-reminder:' || OLD.id::text);
    perform graphile_worker.remove_job('registration-reminder:' || OLD.id::text || ':telegram');
    return OLD;
  end if;
  perform app_private.schedule_registration_reminder(NEW.id);
  return NEW;
end;
$$ language plpgsql security definer set search_path = pg_catalog, public, pg_temp;
revoke all on function app_private.tg__schedule_registration_reminder() from public;
drop trigger if exists schedule_registration_reminder on app_public.event_registration_reminders;
create trigger schedule_registration_reminder after insert or delete or update of minutes_before, delivery_method
  on app_public.event_registration_reminders for each row
  execute function app_private.tg__schedule_registration_reminder();

create or replace function app_private.tg__reschedule_registration_reminders()
returns trigger as $$
declare
  v_id uuid;
begin
  for v_id in select id from app_public.event_registration_reminders
    where event_id = NEW.id and sent_at is null
  loop
    perform app_private.schedule_registration_reminder(v_id);
  end loop;
  return NEW;
end;
$$ language plpgsql security definer set search_path = pg_catalog, public, pg_temp;
revoke all on function app_private.tg__reschedule_registration_reminders() from public;
drop trigger if exists reschedule_registration_reminders on app_public.events;
create trigger reschedule_registration_reminders
  after update of registration_start_time, is_draft on app_public.events
  for each row execute function app_private.tg__reschedule_registration_reminders();

drop function if exists app_public.set_event_registration_reminder(uuid, boolean, text);
drop function if exists app_public.set_event_registration_reminder(uuid, boolean, text, integer);
create or replace function app_public.set_event_registration_reminder(
  event_id uuid, enabled boolean, language text default 'fi', minutes_before integer default 30, delivery_method text default 'email'
) returns boolean as $$
#variable_conflict use_variable
declare
  v_user uuid := app_public.current_user_id();
begin
  if v_user is null then
    raise exception 'Please sign in to manage reminders.' using errcode = 'LOGIN';
  end if;
  if not enabled then
    delete from app_public.event_registration_reminders r
      where r.user_id = v_user and r.event_id = event_id;
    return false;
  end if;
  if minutes_before is null or minutes_before < 1 or minutes_before > 10080 then
    raise exception 'Choose a reminder between 1 minute and 7 days before opening.' using errcode = 'CHECK';
  end if;
  if language not in ('fi', 'en') or language is null then
    raise exception 'Unsupported reminder language.' using errcode = 'CHECK';
  end if;
  if delivery_method is null or delivery_method not in ('email', 'telegram', 'both') then
    raise exception 'Unsupported delivery method.' using errcode = 'CHECK';
  end if;
  if delivery_method in ('telegram', 'both') and not exists(select 1 from app_public.telegram_accounts where user_id = v_user) then
    raise exception 'Connect Telegram before enabling Telegram reminders.' using errcode = 'CHECK';
  end if;
  if delivery_method in ('email', 'both') and not exists(select 1 from app_public.user_emails
    where user_id = v_user and is_primary and is_verified) then
    raise exception 'Verify your primary email before enabling reminders.' using errcode = 'EMAIL';
  end if;
  perform 1 from app_public.events e where e.id = event_id
    and not e.is_draft and e.registration_start_time > now() for share;
  if not found then
    raise exception 'Reminders are only available before registration opens.' using errcode = 'CLOSD';
  end if;
  insert into app_public.event_registration_reminders(user_id, event_id, language, minutes_before, delivery_method)
    values (v_user, event_id, language, minutes_before, delivery_method)
    on conflict on constraint event_registration_reminders_user_id_event_id_key do update
      set minutes_before = excluded.minutes_before, language = excluded.language, delivery_method = excluded.delivery_method,
        sent_at = case
          when excluded.delivery_method = 'email' then event_registration_reminders.email_sent_at
          when excluded.delivery_method = 'telegram' then event_registration_reminders.telegram_sent_at
          when event_registration_reminders.email_sent_at is not null and event_registration_reminders.telegram_sent_at is not null
            then greatest(event_registration_reminders.email_sent_at, event_registration_reminders.telegram_sent_at)
          else null end
      where event_registration_reminders.sent_at is null;
  return true;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
revoke all on function app_public.set_event_registration_reminder(uuid, boolean, text, integer, text) from public;
grant execute on function app_public.set_event_registration_reminder(uuid, boolean, text, integer, text) to :DATABASE_VISITOR;

-- Unlinking cancels Telegram-only reminders and preserves email delivery for both.
create or replace function app_private.disconnect_telegram(target_user uuid) returns void as $$
begin
  delete from app_public.event_registration_reminders where user_id = target_user and delivery_method = 'telegram' and sent_at is null;
  update app_public.event_registration_reminders set delivery_method = 'email', sent_at = email_sent_at
    where user_id = target_user and delivery_method = 'both' and sent_at is null;
  delete from app_private.telegram_link_tokens where user_id = target_user;
  delete from app_public.telegram_accounts where user_id = target_user;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
revoke all on function app_private.disconnect_telegram(uuid) from public;

create or replace function app_public.disconnect_telegram() returns boolean as $$
begin
  if app_public.current_user_id() is null then
    raise exception 'Sign in to disconnect Telegram.' using errcode = 'LOGIN';
  end if;
  perform app_private.disconnect_telegram(app_public.current_user_id());
  return true;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
revoke all on function app_public.disconnect_telegram() from public;
grant execute on function app_public.disconnect_telegram() to :DATABASE_VISITOR;

-- Checkpoints survive polling restarts. A transaction claims each update once.
create table if not exists app_private.telegram_updates (
  update_id bigint primary key,
  processed_at timestamptz not null default now()
);
create table if not exists app_private.telegram_poll_state (
  id boolean primary key default true check(id),
  next_offset bigint not null default 0
);
insert into app_private.telegram_poll_state(id) values(true) on conflict do nothing;

--! split: 4-reminder-preferences.sql
-- An absent row means the user has not completed reminder setup.
create table if not exists app_public.reminder_preferences (
  user_id uuid primary key references app_public.users(id) on delete cascade,
  minutes_before integer not null check (minutes_before between 1 and 10080),
  delivery_method text not null check (delivery_method in ('email', 'telegram', 'both'))
);
comment on table app_public.reminder_preferences is E'@omit create,update,delete\nDefaults for newly enabled registration reminders. Existing reminders retain their settings.';
alter table app_public.reminder_preferences enable row level security;
drop policy if exists own_reminder_preferences on app_public.reminder_preferences;
create policy own_reminder_preferences on app_public.reminder_preferences
  using (user_id = app_public.current_user_id());
grant select on app_public.reminder_preferences to :DATABASE_VISITOR;

create or replace function app_public.current_reminder_preferences()
returns app_public.reminder_preferences as $$
  select * from app_public.reminder_preferences where user_id = app_public.current_user_id();
$$ language sql stable;
grant execute on function app_public.current_reminder_preferences() to :DATABASE_VISITOR;

create or replace function app_public.save_reminder_preferences(minutes_before integer, delivery_method text)
returns app_public.reminder_preferences as $$
#variable_conflict use_variable
declare
  v_user uuid := app_public.current_user_id();
  v_preferences app_public.reminder_preferences;
begin
  if v_user is null then
    raise exception 'Sign in to manage reminder preferences.' using errcode = 'LOGIN';
  end if;
  if minutes_before is null or minutes_before not between 1 and 10080
    or delivery_method is null or delivery_method not in ('email', 'telegram', 'both') then
    raise exception 'Choose a delivery method and a lead time between 1 minute and 7 days.' using errcode = 'CHECK';
  end if;
  if delivery_method in ('telegram', 'both') and not exists(select 1 from app_public.telegram_accounts where user_id = v_user) then
    raise exception 'Connect Telegram before saving Telegram reminders.' using errcode = 'CHECK';
  end if;
  if delivery_method in ('email', 'both') and not exists(select 1 from app_public.user_emails where user_id = v_user and is_primary and is_verified) then
    raise exception 'Verify your primary email before saving reminders.' using errcode = 'EMAIL';
  end if;
  insert into app_public.reminder_preferences as p(user_id, minutes_before, delivery_method)
    values(v_user, minutes_before, delivery_method)
    on conflict(user_id) do update set minutes_before = excluded.minutes_before, delivery_method = excluded.delivery_method
    returning * into v_preferences;
  return v_preferences;
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
revoke all on function app_public.save_reminder_preferences(integer, text) from public;
grant execute on function app_public.save_reminder_preferences(integer, text) to :DATABASE_VISITOR;

create or replace function app_public.enable_event_reminder(event_id uuid, language text default 'fi')
returns boolean as $$
declare
  v_preferences app_public.reminder_preferences;
begin
  if app_public.current_user_id() is null then
    raise exception 'Sign in to enable reminders.' using errcode = 'LOGIN';
  end if;
  select * into v_preferences from app_public.reminder_preferences where user_id = app_public.current_user_id();
  if not found then
    raise exception 'Set up reminder preferences first.' using errcode = 'CHECK';
  end if;
  return app_public.set_event_registration_reminder(event_id, true, language, v_preferences.minutes_before, v_preferences.delivery_method);
end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
revoke all on function app_public.enable_event_reminder(uuid, text) from public;
grant execute on function app_public.enable_event_reminder(uuid, text) to :DATABASE_VISITOR;

--! split: 5-telegram-language.sql
-- Bot preferences belong to a private Telegram chat, including before linking.
-- Retain them across /stop and reconnect; never expose chat IDs in GraphQL.
create table if not exists app_private.telegram_preferences (
  chat_id bigint primary key check (chat_id > 0),
  language text not null default 'auto' check (language in ('auto', 'fi', 'en')),
  detected_language text not null default 'en' check (detected_language in ('fi', 'en'))
);
revoke all on app_private.telegram_preferences from public;
