--! Previous: sha1:4f00de0a12fe4f8d48132d1d2169088bcef24109
--! Hash: sha1:f24e757e035de70b0a8c328d3522f2b23901a9e8

--! split: 3-reminder-preference-updates.sql
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

comment on table app_public.reminder_preferences is E'@omit create,update,delete\nDelivery and timing preferences for upcoming registration reminders.';
