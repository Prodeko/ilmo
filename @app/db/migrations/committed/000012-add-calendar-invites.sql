--! Previous: sha1:6e21d1632031e084a8170854cdbaa50c796b0b88
--! Hash: sha1:b5a91cba1dbd2e7332a44497b7e3a74ba6a9ce31
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
