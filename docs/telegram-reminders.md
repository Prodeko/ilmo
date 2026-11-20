# Telegram reminders

The configured default bot username is **IlmoReminderBot**. No new third-party
packages are needed; the backend uses Telegram's HTTPS Bot API.

## Local setup

1. Create a bot with Telegram's BotFather and save `TELEGRAM_BOT_TOKEN` in your
   local `.env`. Optionally set `TELEGRAM_BOT_USERNAME` (without `@`); it
   defaults to `IlmoReminderBot`. Do not commit tokens or copy them into
   logs/chat.
2. Apply migrations, regenerate GraphQL, and build as usual. Restart `pnpm dev`
   after changing environment variables. The development server starts one
   long-polling connection automatically when the token is configured. No public
   address or tunnel is required for receiving bot updates.
3. In reminder setup or **Settings → My reminders**, click **Connect Telegram**.
   Telegram opens automatically. Sign in to Telegram if needed and press **START
   BOT** (or **Start**). Return to Ilmo; the connection is checked
   automatically. If the browser blocks the new tab, use **Open Telegram**.
   Expired links can be replaced with **Generate a new link**.
4. On a future event, complete **Set up reminders** and choose **Telegram** or
   **Both**, then a lead time. Future events use your saved preferences with one
   click. Email requires a verified primary email; Telegram alone does not.
5. To test immediately, use an event whose registration starts in 5 minutes and
   select a 10-minute reminder. The message includes the opening time in Finland
   and a link. Local HTTP event links are plain text because Telegram inline
   buttons may reject local URLs. They work only while the phone can reach the
   development machine; production HTTPS links use a button.

The poller refuses to run over an existing webhook. Only one poller per database
runs, enforced with a PostgreSQL advisory lock. Polling offsets are durable. Use
a separate test bot/database from production to avoid competing consumers.

The bot API requests run on the machine hosting Ilmo: the developer's laptop
locally, and the application server in production. A phone is only a Telegram
client; a hotspot merely supplies the laptop's internet connection. If Telegram
opens but commands receive no replies, check that the backend can reach
`api.telegram.org` through its network/DNS and that the worker is running. The
local poller retries transient startup connection failures automatically; it
does not overwrite an existing webhook or change network settings.

## Production

Store `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, and a randomly generated
`TELEGRAM_WEBHOOK_SECRET` in the deployment's secret configuration. The webhook
secret may contain 1–256 ASCII letters, digits, underscores, and hyphens. Use an
HTTPS `ROOT_URL`. Production defaults to `TELEGRAM_UPDATE_MODE=webhook` and
requires the secret. After deployment, run:

```sh
node -r @app/config/env.js scripts/telegram-webhook.mjs set
```

The script reads credentials through the normal configuration loader and does
not print them. `status` reports whether a webhook exists; `delete` removes it
without discarding pending updates. Set `TELEGRAM_UPDATE_MODE=polling`
explicitly if production uses a single long-running polling process instead.
Polling and webhooks cannot run simultaneously for the same bot. Ensure the
backend and Graphile Worker remain running; Telegram itself does not run our
code.

## Bot language

Send `/language` to the bot and select **English**, **Suomi**, or **Automatic**.
The text commands `/language en`, `/language fi`, and `/language auto` work too.
The welcome and successful linking replies mention this command. There is no
required language-selection step when linking.

Automatic is the default. It uses the latest language hint received from
Telegram: Finnish (`fi` or `fi-*`) uses Finnish; other languages use English. If
Telegram omits the hint, the last detected language is retained, or English is
used for a new chat. Explicit choices always override automatic detection.
Telegram language changes become visible when the user next interacts with the
bot; the bot cannot detect a client setting change without an update.

All new bot replies and Telegram reminders resolve the preference at delivery
time. Changing it also affects reminders that were scheduled earlier. Event
names fall back to an available translation if necessary. Email reminders keep
the language saved with the reminder. Legacy text-only reply jobs queued before
this feature was deployed retain their original text.

Preferences are stored privately per Telegram chat, including before linking,
and survive `/stop` and reconnecting. Chat identifiers and preferences are not
exposed through GraphQL. Language buttons only affect the private chat's owner;
updates and selections are deduplicated just like linking updates.

For existing production webhooks, rerun the webhook `set` command after
deployment to enable `callback_query` updates for the language buttons. Local
polling picks up the additional update type on restart. No BotFather changes are
required; adding `/language` to the BotFather command menu is optional.

## Linking, cancellation, and retries

Link codes are random, single-use, expire after 15 minutes, and are stored only
as hashes. Requesting a new code replaces the old one. A chat cannot be silently
moved between Ilmo accounts. Usernames are display-only; the numeric
private-chat identifier determines delivery. Group messages are ignored. The
GraphQL API never exposes bot tokens, chat identifiers, or other users' links.

Settings **Disconnect Telegram**, bot `/stop`, and bot-block updates unlink the
account. Pending Telegram-only reminders are removed. Reminders using both
channels keep email delivery. Deleting an account or event cascades to reminders
and jobs. Hidden events pause reminders; opening-time edits reschedule them, and
late jobs do not send after registration opens. Telegram delivery rechecks the
link before sending. Already-started deliveries cannot be recalled.

Email and Telegram use separate Graphile jobs/checkpoints, so a retry on one
channel does not repeat the other. Telegram jobs share a serial queue, are paced
below the free broadcast limit, honor rate-limit retry delays, and unlink chats
when delivery is forbidden (for example, the bot is blocked). Each successful
channel is recorded before its job completes. As with SMTP, a process crash
between provider acceptance and the database commit can still cause a duplicate.
Webhook and polling updates are deduplicated transactionally; replies are queued
in the same transaction as account changes.

Automated tests mock all outbound messages. A real end-to-end test requires the
user to press **Start** in Telegram and then set a reminder in Ilmo.

References: [Telegram Bot API](https://core.telegram.org/bots/api),
[account linking](https://core.telegram.org/bots/features#deep-linking).
