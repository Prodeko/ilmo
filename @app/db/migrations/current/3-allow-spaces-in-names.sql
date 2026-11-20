/*
 * `constrained_name` used to reject any whitespace, which made multi-part
 * first and last names (e.g. "Anna Maria" or "von Wright") impossible to
 * register with. The intent was only to stop registrations whose name is
 * nothing but spaces, so require at least one non-whitespace character
 * instead. Null is still allowed because claimRegistrationToken creates a
 * registration before the names are known.
 */

alter domain app_public.constrained_name
  drop constraint if exists constrained_name_check;

alter domain app_public.constrained_name
  add constraint constrained_name_check check (value ~ '\S');

comment on domain app_public.constrained_name is
  E'A name field which must not be empty or contain only whitespace';
