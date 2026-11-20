/*
 * Calendar invitations: registration emails carry an iCalendar invitation
 * and the event page offers calendar links after signing up. Stores no data;
 * the worker contributor and the client check the `calendar_invites` flag.
 */

insert into app_public.feature_flags (key, description)
  values ('calendar_invites', E'Calendar invitation in registration emails and calendar links after signing up.')
  on conflict (key) do nothing;
