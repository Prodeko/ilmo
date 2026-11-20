--! Previous: sha1:14afad22610b41b44aa9252558421a99ebb91c56
--! Hash: sha1:afc6149bc215d6e6cf1bcabba9005f9b07e231e0

--! split: 1-admin-preview-features.sql
/*
 * Lets the client tell a feature that is on for everyone from one that an
 * admin sees only because it is in `admins_only`, so that such UI can carry a
 * preview marker. Non-admins always get an empty list.
 */

drop function if exists app_public.admin_preview_features();

create function app_public.admin_preview_features() returns setof text as $$
  select f.key
  from app_public.feature_flags as f
  where
    app_public.current_user_is_admin()
    and f.retired_at is null
    and f.available
    and f.state = 'admins_only'
  order by f.key;
$$ language sql stable security definer set search_path to pg_catalog, public, pg_temp;

comment on function app_public.admin_preview_features() is
  E'@simpleCollections only\nKeys of the features enabled for the current user only because they are in admins_only. Empty unless the current user is an admin.';
