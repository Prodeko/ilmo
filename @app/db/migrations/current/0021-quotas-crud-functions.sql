/*
 * These functions define create and update mutations that support operating on
 * multiple quotas at once. These functions allow us to create or update all
 * quotas related to a single event via a single mutation.
 *
 * By default PostGraphile creates CRUD mutations for database tables
 * (https://www.graphile.org/postgraphile/crud-mutations/). We have omitted the
 * create, insert, update and delete mutations for the quotas table and use
 * these functions instead. The default mutations are omitted in
 * @app/server/postgraphile.tags.jsonc file.
 */

drop type if exists app_public.create_event_quotas cascade;
drop type if exists app_public.update_event_quotas cascade;
drop function if exists app_public.create_event_quotas(event_id uuid, quotas app_public.create_event_quotas[]);
drop function if exists app_public.update_event_quotas(event_id uuid, quotas app_public.update_event_quotas[]);

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
returns app_public.quotas[]
as $$
  declare
    v_input app_public.create_event_quotas;
    v_quota app_public.quotas;
    v_ret app_public.quotas[] default '{}';
  begin
    -- Check permissions
    if app_public.current_user_id() is null then
      raise exception 'You must log in to create event quotas' using errcode = 'LOGIN';
    end if;

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
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
comment on function app_public.create_event_quotas(event_id uuid, quotas app_public.create_event_quotas[]) is
  E'Create multiple quotas at once.';

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
returns app_public.quotas[]
as $$
#variable_conflict use_variable
  declare
  v_test int;
    v_quota_ids_to_delete uuid[];
    v_input app_public.update_event_quotas;
    v_quota app_public.quotas;
    v_ret app_public.quotas[] default '{}';
  begin
    -- Check permissions
    if app_public.current_user_id() is null then
      raise exception 'You must log in to update event quotas' using errcode = 'LOGIN';
    end if;

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

    -- Update existing event quotas by id
    foreach v_input in array quotas loop
      if exists(select 1 from app_public.quotas where id = v_input.id) then
        update app_public.quotas
          set position = v_input.position, title = v_input.title, size = v_input.size
          where id = v_input.id
        returning * into v_quota;
      else
        -- Create new quotas that didn't exits before
        insert into app_public.quotas(event_id, position, title, size)
          values (event_id, v_input.position, v_input.title, v_input.size)
        returning * into v_quota;
      end if;

      v_ret := array_append(v_ret, v_quota);
    end loop;

    return v_ret;
  end;
$$ language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp;
comment on function app_public.update_event_quotas(event_id uuid, quotas app_public.update_event_quotas[]) is
  E'Update multiple quotas at once.';
