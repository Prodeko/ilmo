/*
 * Trigger that finds the next person in queue when someone deletes their registration.
 *
 * This trigger dispatches a graphile worker task that sends an email to the
 * person IN_QUEUE who received a spot from IN_QUOTA or IN_OPEN_QUOTA person
 * who deleted their registration.
 */
create function app_private.tg__process_queue() returns trigger as $$
declare
  v_old_registration_status app_hidden.registrations_status_and_position;
  v_received_spot app_hidden.registrations_status_and_position;
begin
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

create trigger _800_process_registration_queue
  -- When a registration that is IN_QUOTA gets deleted and there are people in
  -- queue, someone is going to get a spot in the quota. We want to inform
  -- that person of this by sending them an email.
  before delete on app_public.registrations
  for each row execute procedure app_private.tg__process_queue();

/*
 * Trigger that refreshes app_hidden.registrations_status_and_position.
 *
 * This trigger is executed after insert, update or delete on app_public.[registrations,events,quotas].
 * This ensures that app_hidden.registrations_status_and_position returns the correct registration
 * statuses and positions after any operations that can affect registration status and position.
 */

-- Needed for refresh materialized view concurrently. Also speeds up selects.
create unique index on app_hidden.registrations_status_and_position(id);
create index on app_hidden.registrations_status_and_position(event_id);
create index on app_hidden.registrations_status_and_position(quota_id);

create function app_private.tg__refresh_materialized_view()
  returns trigger as $$
begin
  -- Docs on CONCURRENTLY option: https://www.postgresql.org/docs/12/sql-refreshmaterializedview.html
  refresh materialized view concurrently app_hidden.registrations_status_and_position;
  return null;
end;
$$ language plpgsql security definer set search_path to pg_catalog, public, pg_temp;

create trigger _700_refresh_mat_view
  after insert or update or delete on app_public.registrations for each row
  execute procedure app_private.tg__refresh_materialized_view();

create trigger _300_refresh_mat_view
  after insert or update or delete on app_public.events for each row
  execute procedure app_private.tg__refresh_materialized_view();

create trigger _300_refresh_mat_view
  after insert or update or delete on app_public.quotas for each row
  execute procedure app_private.tg__refresh_materialized_view();
