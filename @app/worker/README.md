# @app/worker

## Local delivery testing

By default, `NODE_ENV=test` captures emails in memory and development mode uses
Ethereal, which does not deliver to real inboxes. To test actual registration
emails locally without running the app in production mode:

1. Configure `SENDGRID_USERNAME` and `SENDGRID_API_KEY` in the local
   environment. The SMTP username is normally `apikey`. The sender configured in
   `@app/config/src/index.ts` must be authorized in SendGrid.
2. Copy `email.local.example.json` to `email.local.json` in this directory and
   replace `allowedRecipients` with the exact email addresses you want to test.
3. Restart the worker (or `pnpm dev`) and complete a new registration using an
   allowed address. Already-sent confirmations are not automatically resent.

The local configuration is ignored by Git, production, and automated tests.
Messages to addresses outside its allowlist are skipped. Remove the file and
restart the worker to return to the normal test transport.

Confirmed registrations and promotions from the waiting list include a calendar
invitation alongside the existing confirmation text. Waitlisted registrations do
not receive an invitation until they get a place. Calendar responses do not
change registration status in Ilmo, and later event edits/cancellations are not
currently synchronized with saved calendar entries.

It's bad practice to perform unnecessary actions during the normal request cycle
as it makes our web app seem slower. It's also bad practice to have a user retry
an action a few seconds later that we could handle easily on the backend for
them. For this reason, we use a job queue to offload this work that does not
have to run synchronously.

Examples of things you may want to run in a job queue:

- sending emails
- building a complex report
- resizing images
- fetching data from potentially slow sources

## Graphile Worker

Our job queue is [Graphile Worker](https://github.com/graphile/worker) which
focusses on simplicity and performance. There are many other job queues, and you
may find that it makes sense for your team to switch out Graphile Worker with
one of those should you prefer.

It's recommended you
[read the Graphile Worker README](https://github.com/graphile/worker) before
writing your own tasks.

## Modularity

Each "task" in the job queue should only perform one small action; this enables
that small action to be retried on error without causing unforeseen
consequences. For this reason, it's not uncommon for tasks to schedule other
tasks to run; for example if you were to email a user a report you might have
one task that generates and stores the report, and another task that's
responsible for emailing it. All our jobs follow this pattern, so all emails
sent go via the central [send_email](src/tasks/send_email.ts) task.

## Cost cutting

It's intended that the worker and the server run and scale independently;
however if you want to run a tiny server suitable for only a few thousand users
you might choose to run the worker within the server process.

## Automatic retries

Graphile Worker will automatically retry any jobs that fail using an exponential
back-off algorithm; see
[the Graphile Worker README](https://github.com/graphile/worker#exponential-backoff).
