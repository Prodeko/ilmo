--! Previous: sha1:0d89f93b916b51053c9fb06c3c59d0c020cfa3ce
--! Hash: sha1:4bdeab2cf39976983a41c972ec5c9c0415e26ad9

--! split: 1-current.sql
/*
 * List all users. Used in the /admin/users/list page
 */
create function app_public.admin_list_users()
returns setof app_public.users
as $$
begin
  -- Check permissions
  -- Cannot use call app_public.check_is_admin(); in a non volatile function
  if not app_public.current_user_is_admin() then
    raise exception 'Acces denied. Only admins are allowed to use this query.' using errcode = 'DNIED';
  end if;

  return query
    select * from app_public.users;
end;
$$ language plpgsql stable set search_path to pg_catalog, public, pg_temp;
comment on function app_public.admin_list_users() is
  E'@sortable\n@filterable\nList all users. Only accessible to admin users.';

/*
 * Delete a user. Used in the /admin/users/list page
 */
create function app_public.admin_delete_user(id uuid)
returns boolean
as $$
declare
  v_deleted_count integer;
begin
  -- Check permissions
  call app_public.check_is_admin();

  if admin_delete_user.id = app_public.current_user_id() then
    raise exception 'You may not delete yourself via this page. Please delete your account from the account settings page.' using errcode = 'DNIED';
  end if;

  delete from app_public.users where users.id = admin_delete_user.id;

  get diagnostics v_deleted_count = row_count;
  if v_deleted_count = 1 then
    return true;
  else
    return false;
  end if;
end;
$$ language plpgsql volatile security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_public.admin_delete_user(user_id uuid) is
  E'Delete a user. Only accessible to admin users.';

/*
 * Set a user's admin status. Used in the /admin/users/list page
 */
create function app_public.set_admin_status(id uuid, is_admin boolean)
returns boolean
as $$
declare
  v_updated_count integer;
begin
  -- Check permissions
  call app_public.check_is_admin();

  if set_admin_status.id = app_public.current_user_id() then
    raise exception 'You may not change your own admin status via this mutation.' using errcode = 'DNIED';
  end if;

  update app_public.users set is_admin = set_admin_status.is_admin where users.id = set_admin_status.id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count = 1 then
    return true;
  else
    return false;
  end if;
end;
$$ language plpgsql volatile security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_public.set_admin_status(id uuid, is_admin boolean) is
  E'Make an existing user admin. Only accessible to admin users.';
