--! Previous: sha1:5174a822aa4302fac083da3c1afc453b4798012a
--! Hash: sha1:afe4a17a3f29df372db6863dbbd3d8f6b63800ed
--! Message: add Telegram reminders

--! split: 52-telegram-reminders.sql
/*
 * Telegram reminders: a user links a Telegram chat to their account through
 * the bot, and registration reminders (51-registration-reminders.sql) can
 * then be delivered there.
 *
 * Linking: `request_telegram_link()` returns a one-time code (stored hashed,
 * valid 15 minutes) that the user sends to the bot with /start; the server's
 * bot update processing consumes it with `app_private.connect_telegram`.
 * Chat identifiers are only exposed to the server, never in GraphQL.
 *
 * Gated by the `telegram_reminders` flag (which the server marks unavailable
 * without TELEGRAM_BOT_TOKEN): requesting a link code raises FTOFF while it is
 * off, the bot webhook answers 404, polling pauses and the Telegram worker
 * tasks do nothing. Disconnecting stays possible.
 */

insert into app_public.feature_flags (key, description)
  values ('telegram_reminders', E'Registration reminders through the Telegram bot, and linking a Telegram account.')
  on conflict (key) do nothing;

create table if not exists app_public.telegram_accounts (
  user_id uuid primary key references app_public.users(id) on delete cascade,
  chat_id bigint not null unique check (chat_id > 0),
  username text,
  created_at timestamptz not null default now()
);
comment on table app_public.telegram_accounts is
  E'@omit create,update,delete\nTelegram accounts linked by their owners.';
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
  if not app_public.feature_enabled('telegram_reminders') then
    raise exception 'Telegram reminders are not available.' using errcode = 'FTOFF';
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

-- Unlinking cancels Telegram-only reminders and keeps email delivery for both.
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

-- Bot preferences belong to a private Telegram chat, including before linking.
-- Keep them across /stop and reconnect; never expose chat IDs in GraphQL.
create table if not exists app_private.telegram_preferences (
  chat_id bigint primary key check (chat_id > 0),
  language text not null default 'auto' check (language in ('auto', 'fi', 'en')),
  detected_language text not null default 'en' check (detected_language in ('fi', 'en'))
);
revoke all on app_private.telegram_preferences from public;
