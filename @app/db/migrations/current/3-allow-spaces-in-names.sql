/*
 * Allow spaces inside names, e.g. the first name "Maijuli Kielo" or the last
 * name "Juokko Tuoppo". Names used to reject any whitespace to stop people
 * from registering with only spaces as their name. Rejecting leading and
 * trailing whitespace keeps that protection, since a name made of only
 * spaces starts with one.
 */

alter domain app_public.constrained_name
  drop constraint if exists constrained_name_check;

alter domain app_public.constrained_name
  add constraint constrained_name_check
  check (value !~ '^\s' and value !~ '\s$');

comment on domain app_public.constrained_name is
  E'A name that must not start or end with whitespace, so it cannot be only spaces.';
