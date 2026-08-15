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
