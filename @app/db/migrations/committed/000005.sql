--! Previous: sha1:eafce160dd3a8ec859a47bc11b5c9117cc07fd8e
--! Hash: sha1:4a7ac05c29125846186aa2020a22e1ca9db39164

--! split: 1-current.sql
/*
 * Admins manage every organization, the same way `manage_admin` on
 * `app_public.events` and `app_public.registrations` already lets them manage
 * every event. Without this, `update_owner` is the only route to updating an
 * organization, so changing one's settings requires an `is_owner` row in
 * `organization_memberships` — which admins have no reason to hold, and which
 * nobody holds for an organization they did not create.
 *
 * Membership keeps its own meaning: the way a non-admin is given rights over a
 * single organization's events.
 */

drop policy if exists manage_admin on app_public.organizations;

create policy manage_admin on app_public.organizations
  for all using (app_public.current_user_is_admin());

--! split: 2-delete-omitted-quotas-and-questions.sql
/*
 * The admin UI sends an event's kept quotas with their ids and newly added
 * quotas with a null id. Deletion of omitted quotas is detected with
 * `q.id not in (select id from unnest(quotas))`, and in SQL `NOT IN` never
 * evaluates true when the compared set contains a null — so a single null id
 * in the input disables deletion for the whole call. Excluding nulls from the
 * comparison set keeps the three-valued logic out of the way: kept ids still
 * match, and omitted quotas are deleted regardless of whether the same edit
 * also adds new quotas.
 */

create or replace function app_public.update_event_quotas(
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
    and q.id not in (select id from unnest(quotas) where id is not null)
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

--! split: 3-registration-positions-table.sql
/*
 * Registration statuses and positions are kept in a table that is maintained
 * per event. Every change to an event's registrations, quota sizes or open
 * quota size recomputes the positions of that event only, inside the same
 * transaction, so readers always see current positions and a change to one
 * event never touches the rows of another.
 */

drop trigger if exists _700_refresh_mat_view on app_public.registrations;
drop trigger if exists _300_refresh_mat_view on app_public.events;
drop trigger if exists _300_refresh_mat_view on app_public.quotas;
drop function if exists app_private.tg__refresh_materialized_view();

drop trigger if exists _700_refresh_registration_positions on app_public.registrations;
drop trigger if exists _701_refresh_registration_positions on app_public.registrations;
drop trigger if exists _300_refresh_registration_positions on app_public.events;
drop trigger if exists _301_refresh_registration_positions on app_public.events;
drop trigger if exists _300_refresh_registration_positions on app_public.quotas;
drop trigger if exists _301_refresh_registration_positions on app_public.quotas;
drop function if exists app_private.tg__refresh_registration_positions();
drop function if exists app_private.refresh_registration_positions(uuid);

do $$
begin
  if exists (
    select 1 from pg_matviews
    where schemaname = 'app_hidden' and matviewname = 'registrations_status_and_position'
  ) then
    drop materialized view app_hidden.registrations_status_and_position;
  end if;
end
$$;
drop table if exists app_hidden.registrations_status_and_position;

create table app_hidden.registrations_status_and_position (
  id uuid primary key,
  event_id uuid,
  quota_id uuid,
  status app_public.registration_status,
  position integer
);
create index on app_hidden.registrations_status_and_position(event_id);
create index on app_hidden.registrations_status_and_position(quota_id);
alter table app_hidden.registrations_status_and_position enable row level security;

create policy select_all on app_hidden.registrations_status_and_position
  for select using (true);
grant select on app_hidden.registrations_status_and_position to :DATABASE_VISITOR;

comment on table app_hidden.registrations_status_and_position is
  E'Rank and position of registrations, maintained per event by app_private.refresh_registration_positions.';

/*
 * Recomputes the statuses and positions of one event's registrations.
 *
 * The advisory lock serializes recomputes of the same event until the end of
 * the transaction. In READ COMMITTED each following statement takes a fresh
 * snapshot, so a recompute that waited for the lock sees every registration
 * committed by the transaction that held it.
 */
create function app_private.refresh_registration_positions(p_event_id uuid)
returns void as $$
begin
  perform pg_advisory_xact_lock(hashtext('registration_positions:' || p_event_id::text));

  delete from app_hidden.registrations_status_and_position
    where event_id = p_event_id;

  insert into app_hidden.registrations_status_and_position(id, event_id, quota_id, status, position)
    with cte1 as (
      select
        r.id,
        size,
        r.event_id,
        r.quota_id,
        e.open_quota_size,
        r.created_at,
        row_number() over (partition by r.quota_id order by r.created_at asc) as tmp_pos_quota
      from app_public.registrations r
      left join app_public.quotas q
        on r.quota_id = q.id
      left join app_public.events e
        on r.event_id = e.id
      where r.event_id = p_event_id
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
        event_id,
        quota_id,
        status,
        case
          -- row_number() returns bigint but we cast it to integer to avoid
          -- introducing another type to our GraphQL API. Besides, we are not
          -- expecting to have that many registrations in the system.
          when status = 'IN_QUOTA'::app_public.registration_status then cast(row_number() over (partition by quota_id, status order by created_at asc) as integer)
          else cast(row_number() over (partition by event_id, status order by created_at asc) as integer)
        end as position
      from cte3;
end;
$$ language plpgsql volatile security definer set search_path to pg_catalog, public, pg_temp;
revoke all on function app_private.refresh_registration_positions(uuid) from public;
comment on function app_private.refresh_registration_positions(uuid) is
  E'Recomputes app_hidden.registrations_status_and_position for the registrations of one event.';

/*
 * Recomputes positions for the event(s) a row of app_public.[registrations,
 * quotas,events] belongs to before and after the change.
 */
create function app_private.tg__refresh_registration_positions()
  returns trigger as $$
begin
  if TG_TABLE_NAME = 'events' then
    perform app_private.refresh_registration_positions(coalesce(NEW.id, OLD.id));
    return null;
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    perform app_private.refresh_registration_positions(OLD.event_id);
  end if;
  if TG_OP = 'INSERT' or (TG_OP = 'UPDATE' and NEW.event_id is distinct from OLD.event_id) then
    perform app_private.refresh_registration_positions(NEW.event_id);
  end if;
  return null;
end;
$$ language plpgsql volatile security definer set search_path to pg_catalog, public, pg_temp;
revoke all on function app_private.tg__refresh_registration_positions() from public;

-- Updates recompute only when a rank input changes.
create trigger _700_refresh_registration_positions
  after insert or delete on app_public.registrations for each row
  execute procedure app_private.tg__refresh_registration_positions();
create trigger _701_refresh_registration_positions
  after update on app_public.registrations for each row
  when (
    OLD.created_at is distinct from NEW.created_at or
    OLD.quota_id is distinct from NEW.quota_id or
    OLD.event_id is distinct from NEW.event_id
  )
  execute procedure app_private.tg__refresh_registration_positions();

create trigger _300_refresh_registration_positions
  after insert or delete on app_public.quotas for each row
  execute procedure app_private.tg__refresh_registration_positions();
create trigger _301_refresh_registration_positions
  after update on app_public.quotas for each row
  when (
    OLD.size is distinct from NEW.size or
    OLD.event_id is distinct from NEW.event_id
  )
  execute procedure app_private.tg__refresh_registration_positions();

create trigger _300_refresh_registration_positions
  after insert or delete on app_public.events for each row
  execute procedure app_private.tg__refresh_registration_positions();
create trigger _301_refresh_registration_positions
  after update on app_public.events for each row
  when (OLD.open_quota_size is distinct from NEW.open_quota_size)
  execute procedure app_private.tg__refresh_registration_positions();

select app_private.refresh_registration_positions(id) from app_public.events;

/*
 * Queue promotion reads positions under the same per-event lock as the
 * recompute.
 */
create or replace function app_private.tg__process_queue() returns trigger as $$
declare
  v_old_registration_status app_hidden.registrations_status_and_position;
  v_received_spot app_hidden.registrations_status_and_position;
begin
  -- Wait for in-flight position recomputes of this event so that the lookup
  -- below sees every committed registration, including one that would be
  -- first in queue.
  perform pg_advisory_xact_lock(hashtext('registration_positions:' || OLD.event_id::text));

  select *
    into v_old_registration_status
    from app_hidden.registrations_status_and_position
    where
      id = OLD.id;

  if v_old_registration_status.status = 'IN_QUOTA' then
    select *
      into v_received_spot
      from app_hidden.registrations_status_and_position
      where
        event_id = v_old_registration_status.event_id and
        quota_id = v_old_registration_status.quota_id and
        status = 'IN_QUEUE'::app_public.registration_status and
        position = 1
      order by position desc;
  elsif v_old_registration_status.status = 'IN_OPEN_QUOTA' then
    select *
      into v_received_spot
      from app_hidden.registrations_status_and_position
      where
        -- Almost the same where condition as above, only quota_id is
        -- missing since open quota spots can be populated by any quota
        event_id = v_old_registration_status.event_id and
        status = 'IN_QUEUE'::app_public.registration_status and
        position = 1
      order by position desc;
  else
    -- The deleted registration was in queue, nobody will get a spot so return.
    return OLD;
  end if;

  if v_received_spot is not null then
    perform graphile_worker.add_job(
      'registration__process_queue',
      json_build_object('receivedSpot', v_received_spot)
    );
  end if;

  return OLD;
end;
$$ language plpgsql;
