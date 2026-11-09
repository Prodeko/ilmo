# Registration reminders

Signed-in users can request one reminder per upcoming published event. Reminders
are sent before **registration opens**, not before the event starts.

The first click on **Set up reminders** opens a two-step flow on the event page:
choose email, Telegram, or both (connecting Telegram in place if needed), then
choose a lead time and click **Save**. A verified primary email is required for
email delivery; Telegram requires a linked chat. Telegram is offered when the
bot is configured. Linking can be checked manually or by returning to the
browser tab after pressing Start in Telegram.

Preferences are saved to the user's account across devices. Afterwards, **Set
reminder** enables each event in one click. **Change reminder settings** leads
to settings, where users can change defaults, manage Telegram, and remove
existing reminders. Saving preferences does not subscribe to new events. It
updates and reschedules the user's upcoming unsent reminders; sent and past
reminders retain their history. Already delivered channels are not resent. If a
delivery channel becomes unavailable, the next opt-in asks the user to repair
their settings. Existing users without saved preferences are also guided through
setup; their existing reminders are preserved.

Lead-time presets are 5, 10, 15 or 30 minutes, 1 hour, or 1 day before opening.
Previously saved custom lead times remain available when editing defaults.
Subscribing inside that window schedules an immediate reminder. Delivery uses
the existing email transport, so local delivery still follows
`@app/worker/email.local.json` and its recipient allowlist.

### Multiple reminders

Keep one reminder per event for now: a single clear opt-in and status is
simpler, and avoids duplicate immediate messages when several selected times
have already passed. Multiple times could be a later optional advanced
preference (for example, 30 and 15 minutes). This would require separate
delivery records per time, grouped cancellation, and a policy for elapsed
reminders; it is not enabled by this change.

## Scheduling and delivery

The database schedules a Graphile Worker job when a reminder is created. Editing
the registration opening time reschedules pending jobs; marking an event as a
draft pauses them, and republishing schedules them again. Removing a reminder,
event, or account removes its pending jobs. Sent reminders are not resent when
the event is edited.

The worker reads the current event details and verified primary email
immediately before sending. It skips deleted, hidden, expired, or already-sent
reminders and reschedules jobs that are now too early. Emails show the opening
time in Finland's time zone, including daylight saving changes. Row locks
serialize delivery and cancellation. A cancellation cannot retract an email
already being sent.

Normal retries skip reminders recorded as sent. SMTP and PostgreSQL cannot
commit atomically: a process crash after SMTP acceptance but before recording
success could still produce a duplicate. Delivery timing also depends on the
worker and email provider. Reminders do not reserve places or register users for
events.

## Trying it locally

1. Apply committed migrations with `pnpm db migrate`, regenerate GraphQL, and
   run the usual `pnpm dev`.
2. Sign in with an account whose verified primary email is an allowed local test
   recipient if real email delivery is enabled.
3. Create a published test event with registration opening in five minutes and
   closing later, before the event starts.
4. Open the event and complete **Set up reminders**, choosing a 30-minute lead
   time. Since the opening time is inside the reminder window, the worker should
   send it shortly.
5. Check **My reminders** for the sent status and inspect the email's opening
   time and event link.

To test scheduling and cancellation without immediate delivery, set registration
to open an hour from now. Enable a reminder, change the opening time, or remove
the reminder before it becomes due.

Database and worker tests cover account isolation, authentication and
verification, uniqueness, cancellation, rescheduling, hiding/deleting events,
late subscriptions, delivery idempotence, retries, and Finland time-zone
conversion. The database tests use the separate test database and mock delivery;
they do not send live email.
