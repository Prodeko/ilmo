--! Previous: sha1:9efdb963bf8c8b6ab9929c19c4f39c05b763fd19
--! Hash: sha1:99af1a1da39b6f014412d9754dea7146fda9eff4
--! Message: add prefilled registration answers

--! split: 80-registration-prefill.sql
/*
 * Registration prefill. The registration form prefills the registrant's name
 * and email from their account. Telegram handles and dietary restrictions are
 * asked with ordinary event questions, so an admin marks which question asks
 * which (`event_questions.prefill`), and the answer is prefilled from the
 * user's registration profile.
 */

do $$
begin
  create type app_public.question_prefill as enum (
    'TELEGRAM',
    'DIETARY_RESTRICTIONS'
  );
exception when duplicate_object then null;
end
$$;

alter table app_public.event_questions
  add column if not exists prefill app_public.question_prefill;

-- The registration profile stores free text, which only fits a TEXT answer
alter table app_public.event_questions
  drop constraint if exists _cnstr_prefill_text_only;
alter table app_public.event_questions
  add constraint _cnstr_prefill_text_only check(prefill is null or type = 'TEXT');

comment on column app_public.event_questions.prefill is
  E'Which registration profile field prefills the answer to this question, if any.';

grant
  insert (prefill),
  update (prefill)
on app_public.event_questions to :DATABASE_VISITOR;

-- Input types for app_public.create_event_questions and
-- app_public.update_event_questions
do $$
begin
  alter type app_public.create_event_questions add attribute prefill app_public.question_prefill;
exception when duplicate_column then null;
end
$$;

do $$
begin
  alter type app_public.update_event_questions add attribute prefill app_public.question_prefill;
exception when duplicate_column then null;
end
$$;

create or replace function app_public.create_event_questions(
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
    insert into app_public.event_questions(event_id, position, type, label, is_required, data, prefill)
      values (event_id, v_input.position, v_input.type, v_input.label, v_input.is_required, v_input.data, v_input.prefill)
      returning * into v_question;

    v_ret := array_append(v_ret, v_question);
  end loop;

  return v_ret;
end;
$$ language plpgsql volatile security invoker set search_path = pg_catalog, public, pg_temp;

create or replace function app_public.update_event_questions(
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
    and q.id not in (select id from unnest(questions) where id is not null)
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
        set position = v_input.position, type = v_input.type, label = v_input.label, is_required = v_input.is_required, data = v_input.data, prefill = v_input.prefill
        where id = v_input.id
      returning * into v_question;
    else
      -- Create new questions that didn't exist before
      insert into app_public.event_questions(event_id, position, type, label, is_required, data, prefill)
        values (event_id, v_input.position, v_input.type, v_input.label, v_input.is_required, v_input.data, v_input.prefill)
      returning * into v_question;
    end if;

    v_ret := array_append(v_ret, v_question);
  end loop;

  return v_ret;
end;
$$ language plpgsql volatile security invoker set search_path = pg_catalog, public, pg_temp;

/*
 * The registration profile holds the values used to prefill registration
 * answers. It is a table of its own rather than columns on app_public.users
 * because users are publicly visible, and dietary restrictions are not
 * anyone else's business.
 */
create table if not exists app_public.registration_profiles (
  user_id uuid primary key references app_public.users on delete cascade,
  telegram text check(length(telegram) <= 64),
  dietary_restrictions text check(length(dietary_restrictions) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app_public.registration_profiles enable row level security;

drop trigger if exists _100_timestamps on app_public.registration_profiles;
create trigger _100_timestamps
  before insert or update on app_public.registration_profiles for each row
  execute procedure app_private.tg__timestamps();

comment on table app_public.registration_profiles is
  E'Values used to prefill event registration answers. Only visible to the user themselves.';
comment on column app_public.registration_profiles.user_id is
  E'The user this registration profile belongs to.';
comment on column app_public.registration_profiles.telegram is
  E'Telegram handle.';
comment on column app_public.registration_profiles.dietary_restrictions is
  E'Dietary restrictions and allergies.';

drop policy if exists select_own on app_public.registration_profiles;
drop policy if exists insert_own on app_public.registration_profiles;
drop policy if exists update_own on app_public.registration_profiles;
drop policy if exists delete_own on app_public.registration_profiles;
create policy select_own on app_public.registration_profiles for select using (user_id = app_public.current_user_id());
create policy insert_own on app_public.registration_profiles for insert with check (user_id = app_public.current_user_id());
create policy update_own on app_public.registration_profiles for update using (user_id = app_public.current_user_id());
create policy delete_own on app_public.registration_profiles for delete using (user_id = app_public.current_user_id());

grant
  select,
  insert (user_id, telegram, dietary_restrictions),
  update (telegram, dietary_restrictions),
  delete
on app_public.registration_profiles to :DATABASE_VISITOR;

/*
 * Answers are saved into the registration profile only when the user asks
 * for it: on the settings page, or by ticking "remember these answers" in
 * the registration form, which calls set_registration_profile after the
 * registration succeeded. Nothing saves them inside the registration itself.
 */
drop trigger if exists _500_save_registration_profile on app_public.registrations;
drop function if exists app_private.tg_registrations__save_registration_profile();

/*
 * Creates or updates the current user's registration profile. A null
 * argument keeps the saved value and an empty one clears it, so the
 * registration form can save only the fields its event asks for. Refused
 * while `prefill_answers` is off; delete_registration_profile still works.
 */
create or replace function app_public.set_registration_profile(
  telegram text default null,
  dietary_restrictions text default null
)
returns app_public.registration_profiles as $$
#variable_conflict use_variable
declare
  v_user_id uuid := app_public.current_user_id();
  v_profile app_public.registration_profiles;
begin
  if v_user_id is null then
    raise exception 'You must log in to update your registration profile' using errcode = 'LOGIN';
  end if;

  if not app_public.feature_enabled('prefill_answers') then
    raise exception 'Saving registration answers is not enabled' using errcode = 'FTOFF';
  end if;

  insert into app_public.registration_profiles(user_id, telegram, dietary_restrictions)
    values (v_user_id, nullif(trim(telegram), ''), nullif(trim(dietary_restrictions), ''))
  on conflict (user_id) do update
    set
      telegram = case
        when telegram is null then registration_profiles.telegram
        else excluded.telegram
      end,
      dietary_restrictions = case
        when dietary_restrictions is null then registration_profiles.dietary_restrictions
        else excluded.dietary_restrictions
      end
  returning * into v_profile;

  return v_profile;
end;
$$ language plpgsql volatile security invoker set search_path = pg_catalog, public, pg_temp;
comment on function app_public.set_registration_profile(telegram text, dietary_restrictions text) is
  E'Set the values used to prefill your event registrations. A null value keeps the saved one and an empty value clears it.';

/*
 * Deletes the current user's registration profile. Not gated: removing your
 * own data keeps working while `prefill_answers` is off.
 */
create or replace function app_public.delete_registration_profile()
returns boolean as $$
declare
  v_user_id uuid := app_public.current_user_id();
begin
  if v_user_id is null then
    raise exception 'You must log in to delete your registration profile' using errcode = 'LOGIN';
  end if;

  delete from app_public.registration_profiles where user_id = v_user_id;
  return found;
end;
$$ language plpgsql volatile security invoker set search_path = pg_catalog, public, pg_temp;
comment on function app_public.delete_registration_profile() is
  E'Delete the values saved to prefill your event registrations.';

/*
 * The question type select offers prefill questions, the register page
 * prefills their answers and the registration form and settings page save
 * them only while `prefill_answers` is on. Questions keep their `prefill`
 * marking whatever the flag's state.
 */
insert into app_public.feature_flags (key, description)
  values (
    'prefill_answers',
    'Prefill Telegram and dietary restriction answers from a registration profile the user saves on request.'
  )
  on conflict (key) do nothing;
