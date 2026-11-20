--! Previous: sha1:5be9acbd207f7b3514e90e1ecd7b6db2951c5dd9
--! Hash: sha1:51c8483bf2ba1cedaf50a8530c75ba90e66d6a06
--! Message: add calendar invites

--! split: 50-calendar-invites.sql
/*
 * Calendar invitations: registration emails carry an iCalendar invitation
 * and the event page offers calendar links after signing up. Stores no data;
 * the worker contributor and the client check the `calendar_invites` flag.
 */

insert into app_public.feature_flags (key, description)
  values ('calendar_invites', E'Calendar invitation in registration emails and calendar links after signing up.')
  on conflict (key) do nothing;
