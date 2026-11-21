--! Previous: sha1:86191a97641e77baa1b163178f5f23cfcad7ed04
--! Hash: sha1:a82534fccfc43de4a5611c2911fbf0d72b9b9c05
--! Message: add MCP sessions

--! split: 60-mcp-sessions.sql
/*
 * MCP server: the `mcp_server` flag, and Keycloak-token sessions.
 *
 * The flag gates every MCP route (they answer 404 while it is off). The
 * server marks it unavailable at boot unless KEYCLOAK_ISSUER is set.
 */

insert into app_public.feature_flags (key, description)
  values ('mcp_server', E'MCP server at /mcp for AI assistants: browse events, register, and let admins create draft events.')
  on conflict (key) do nothing;

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
