--! Previous: sha1:eafce160dd3a8ec859a47bc11b5c9117cc07fd8e
--! Hash: sha1:d86e34f82d1579f1b5f6f91bd24ccb41f19b5d53

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

--! split: 3-mcp-sessions.sql
/*
 * MCP requests authenticate with a Keycloak access token instead of a session
 * cookie. The server turns each verified token into an ordinary
 * app_private.sessions row so that current_user_id(), RLS and the ownership
 * triggers work unchanged, and so that the database keeps identifying users by
 * an unguessable session id rather than by a raw user id (see the comment on
 * current_user_id).
 *
 * One MCP session exists per Keycloak session (`oauth_sid`, the token's `sid`
 * claim): token refreshes reuse it. The rows are derived state — the server
 * recreates one on the next request if it is gone — so inactive MCP sessions
 * can be deleted aggressively by the sessions__delete_inactive_mcp_sessions
 * task.
 */

alter table app_private.sessions
  add column if not exists kind text not null default 'web',
  add column if not exists oauth_sid text;

alter table app_private.sessions drop constraint if exists sessions_kind_check;
alter table app_private.sessions
  add constraint sessions_kind_check check (kind in ('web', 'mcp'));

alter table app_private.sessions drop constraint if exists sessions_oauth_sid_check;
alter table app_private.sessions
  add constraint sessions_oauth_sid_check check ((kind = 'mcp') = (oauth_sid is not null));

drop index if exists app_private.sessions_mcp_oauth_sid_key;
create unique index sessions_mcp_oauth_sid_key
  on app_private.sessions (oauth_sid) where kind = 'mcp';

comment on column app_private.sessions.kind is
  E'How the session was established: web (session cookie) or mcp (Keycloak access token on /mcp).';
comment on column app_private.sessions.oauth_sid is
  E'Keycloak session id (the access token sid claim) of an mcp session.';
