/*
 * Registration reminders: a signed-in user asks to be reminded a chosen time
 * before an event's registration opens, by email, Telegram or both.
 *
 * Each reminder schedules one graphile-worker job per channel with a job key
 * (`registration-reminder:<id>` and `...:telegram`), rescheduled whenever the
 * reminder or the event's opening time changes. The tasks re-validate the
 * reminder when they run and record a sent marker per channel.
 *
 * `reminder_preferences` holds the defaults a user saves once; saving them
 * also updates the user's upcoming unsent reminders.
 *
 * The Telegram tables and functions used here are in
 * 52-telegram-reminders.sql.
 */

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
create index if not exists event_registration_reminders_event_id_idx
  on app_public.event_registration_reminders(event_id);

comment on table app_public.event_registration_reminders is
  E'@omit create,update\nRegistration reminders requested by the current user, before registration opens.';
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

/*
 * Reminder preferences. An absent row means the user has not completed
 * reminder setup.
 */

create table if not exists app_public.reminder_preferences (
  user_id uuid primary key references app_public.users(id) on delete cascade,
  minutes_before integer not null check (minutes_before between 1 and 10080),
  delivery_method text not null check (delivery_method in ('email', 'telegram', 'both'))
);
comment on table app_public.reminder_preferences is
  E'@omit create,update,delete\nDelivery and timing preferences for upcoming registration reminders.';
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
  -- Lock reminders in a stable order before rescheduling them.
  perform 1 from app_public.event_registration_reminders r
    join app_public.events e on e.id = r.event_id
    where r.user_id = v_user and r.sent_at is null and e.registration_start_time > now()
    order by r.id for update of r;
  update app_public.event_registration_reminders r
    set minutes_before = v_preferences.minutes_before,
      delivery_method = v_preferences.delivery_method,
      sent_at = case
        when v_preferences.delivery_method = 'email' then r.email_sent_at
        when v_preferences.delivery_method = 'telegram' then r.telegram_sent_at
        when r.email_sent_at is not null and r.telegram_sent_at is not null
          then greatest(r.email_sent_at, r.telegram_sent_at)
        else null end
    from app_public.events e
    where r.user_id = v_user and r.event_id = e.id
      and r.sent_at is null and e.registration_start_time > now();
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
