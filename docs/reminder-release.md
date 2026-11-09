# Releasing registration reminders

This feature runs in the existing Ilmo server, Graphile Worker and PostgreSQL.
It does not require a new Azure service. Email is sent through the existing
SendGrid transport; Telegram is sent through the Bot API.

## Database migration

Migrations `000005.sql` and `000006.sql` contain only notification changes:
reminder preferences, Telegram linking/language state, scheduling, and
propagation of preference changes to upcoming unsent reminders. The pre-existing
admin organization policy and quota/question fixes remain unchanged in
`migrations/current/` and are separate from this feature.

This is a schema migration, not a local data export. Production users choose
preferences and link their own Telegram accounts. The SQL initializes a polling
offset and backfills an email-delivery checkpoint only if reminder rows already
exist in the target database.

Apply committed migrations once using the new release and production connection
settings, before starting its server and worker:

```sh
pnpm db migrate
```

Do not run `setup`, `setup:db`, `reset`, or `watch` against production. Ensure
the Graphile Worker database schema is installed before this application's
migration. Use the normal database backup process before deployment. An older
application image can leave the additive reminder tables in place; stopping the
new worker also stops notification delivery. A sent notification cannot be
recalled.

## Production configuration

| Variable                                | Container         | Purpose                                                          |
| --------------------------------------- | ----------------- | ---------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`                    | Server and worker | Bot API credential; store as a secret                            |
| `TELEGRAM_BOT_USERNAME`                 | Server            | Public bot username, without `@`                                 |
| `TELEGRAM_UPDATE_MODE=webhook`          | Server            | Receive bot commands over HTTPS                                  |
| `TELEGRAM_WEBHOOK_SECRET`               | Server            | Random 1–256-character secret using letters, digits, `_` and `-` |
| `ROOT_URL`                              | Server and worker | Public HTTPS application URL                                     |
| `SENDGRID_USERNAME`, `SENDGRID_API_KEY` | Worker            | Existing email delivery credentials                              |

Keep the development bot separate from production. Runtime bot configuration is
read by the server; the image build does not need the bot token.

After starting the new server and worker, register the webhook from the server
container's application directory, with its production environment loaded:

```sh
node -r @app/config/env.js scripts/telegram-webhook.mjs set
node -r @app/config/env.js scripts/telegram-webhook.mjs status
```

The HTTPS reverse proxy must forward `/telegram/webhook` and preserve the
`X-Telegram-Bot-Api-Secret-Token` header. Registering the webhook also enables
the `callback_query` updates needed by language buttons. Do not run a local
poller against the production bot.

## Deployment pipeline checks

A push to `main` runs CI and end-to-end tests before the production workflow
builds `prodekoregistry.azurecr.io/ilmo/ilmo:sha-<commit>` and calls
`/srv/www/ilmo/deploy.sh` over SSH. That VM script is not in this repository.

Before releasing, verify that the VM script:

- Deploys the same new image to both the server and worker.
- Applies committed migrations before starting the new application.
- Loads the production variables above into the correct containers.
- Keeps the worker running and captures its failures in logs/monitoring.

The checked-in production Compose file still names the older separate server and
worker images. Confirm which Compose file the VM actually uses before
deployment; do not assume editing this repository's Compose file changes the
running setup.

## Validation and smoke test

Run `pnpm lint`, `pnpm test --ci --runInBand`, and `pnpm build` with local
services running. CI also exercises the Docker image and Cypress browser tests.
Automated Telegram tests mock outbound requests and send no real notifications.

On a staging deployment or before announcing production availability:

1. Sign in with a test account and open a published event whose registration
   opens in the future. Complete setup and link the test bot by pressing Start.
2. Select a lead time longer than the remaining time until registration opens;
   this makes the reminder due immediately. Confirm the Telegram message
   arrives.
3. Run `/language`, choose the other language, and check a newly due reminder.
   Changes also apply to reminders scheduled before changing language.
4. Enable another event in one click, reload, and confirm it remains enabled.
5. Cancel a reminder before it is due and confirm no message arrives.
6. If testing both channels, use a verified primary email and confirm each
   channel delivers once. Changing bot language must not change email language.
7. Check worker logs for delivery failures and delayed jobs. A few seconds of
   delay is acceptable; sustained backlog or repeated failures needs attention.

## Maintenance

- Event button: `@app/client/src/components/EventReminder.tsx`.
- Setup flow: `@app/client/src/components/ReminderPreferences.tsx`.
- Saved settings and reminder list:
  `@app/client/src/pages/settings/reminders.tsx`.
- Website wording: `@app/client/src/translations/{fi,en,se}/reminders.json`.
- Bot replies, language names and language resolution:
  `@app/lib/src/telegram.ts`.
- Bot command processing: `@app/server/src/telegram.ts`.
- Delivery checks, message text and event links:
  `@app/worker/src/tasks/reminder__send_registration.ts`.
- Email appearance: `@app/worker/templates/registration_reminder.mjml.njk`.

Change source files, update the corresponding tests, and use the normal PR and
release process. Message wording is maintained in code, not BotFather. See also
[registration reminders](registration-reminders.md) and
[Telegram reminders](telegram-reminders.md).
