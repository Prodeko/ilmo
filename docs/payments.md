# Stripe payments

Ilmo can charge for event quotas through Stripe Checkout (cards, Apple Pay and
Google Pay). Two things decide whether payments are on:

- **Configuration.** Both of these environment variables must be set for the
  server (the worker never calls Stripe):

  | Variable                | Value                                                   |
  | ----------------------- | ------------------------------------------------------- |
  | `STRIPE_SECRET_KEY`     | Stripe secret API key, `sk_test_...` (or `sk_live_...`) |
  | `STRIPE_WEBHOOK_SECRET` | Signing secret of the webhook endpoint, `whsec_...`     |

  At startup the server records whether they are present in the `available`
  column of the `payments` feature flag (`requiresEnv` in
  `@app/lib/src/featureFlags.ts`; `paymentsConfigured()` in
  `@app/lib/src/payments.ts`). Without them the flag reads as off and cannot be
  switched on, and the webhook route is not registered.

- **The `payments` feature flag** (off, admins only, or on), switched by a
  developer. While it is off no payment UI is shown and nobody can start a
  payment; see [Turning payments off](#turning-payments-off).

An event is paid when one of its quotas has a ticket price; there is no separate
payment setting. Payment opens when the event's registration closes: nobody pays
while registration is open. Ilmo never refunds anything; see
[Refunds](#refunds).

Money is always stored as integer cents. A participant pays the quota's ticket
price at the time of payment plus a 0,25 € service fee; Stripe keeps 0,25 € +
1,5 %.

## Testing locally with your own Stripe test-mode keys

You need a Stripe account (a free personal one is fine; it stays in test mode)
and the [Stripe CLI](https://docs.stripe.com/stripe-cli).

1. **Get a test-mode secret key.** In the Stripe dashboard, switch to _Test
   mode_ and open _Developers → API keys_
   (https://dashboard.stripe.com/test/apikeys). Copy the _Secret key_
   (`sk_test_...`).

2. **Forward webhooks to your machine.** Log the CLI in once and start the
   forwarder, limited to the two events Ilmo handles (`HANDLED_STRIPE_EVENTS` in
   `@app/server/src/payments/webhook.ts`):

   ```sh
   stripe login
   stripe listen \
     --events checkout.session.completed,checkout.session.expired \
     --forward-to localhost:5678/api/stripe/webhook
   ```

   It prints `Your webhook signing secret is whsec_...`. Keep it running while
   you test; the secret stays the same between runs of `stripe listen` for the
   same account. If your `PORT` is not 5678, change the URL to match.

3. **Set the variables in `.env`.** `pnpm setup` asks for the keys (optional)
   whenever `.env` has no `STRIPE_SECRET_KEY` line yet, for example the first
   time it creates `.env`. Otherwise edit `.env`:

   ```sh
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...   # the one printed by `stripe listen`
   ```

4. **Restart** `pnpm dev` (or the server) so that it picks up the new
   environment, then switch the `payments` feature flag on (as a developer, with
   the `setFeatureFlag` mutation, or with
   `select app_public.set_feature_flag('payments', 'on')` in a developer's
   session).

5. **Create a paid event.** Log in as an admin (or a member of the organizing
   organization) and go to _Admin → Create event_ (`/admin/event/create`):

   - _Quotas_ tab: set a _Ticket price_ for at least one quota. 0 € is free;
     otherwise the price must be between 0,25 € and 10 000 €. "Guild receives ≈"
     shows what is left after Stripe's fees.
   - Make sure registration is open now, and save without _Save as draft_.

6. **Register.** Open the event, pick the paid quota and register. The form says
   what the ticket costs and that the payment link is emailed when registration
   closes; nothing is paid now. The confirmation email says the same.

7. **Close registration and pay.** Edit the event and move the registration end
   time to a moment ago (or wait for it). Within a minute the worker's
   `event__send_unpaid_on_close` task emails everyone with a spot who has not
   paid their own payment link, `/pay/<updateToken>`. Open it and press _Pay_,
   which takes you to Stripe Checkout. Pay with the test card **4242 4242 4242
   4242**, any future expiry date, any CVC and any postal code. Stripe sends you
   back to `/pay/<updateToken>`, which shows a "Confirming your payment with
   Stripe" notice until the `checkout.session.completed` webhook arrives (watch
   the `stripe listen` terminal), then _Payment received_. The registration's
   update page and the admin _Registrations_ tab show it as paid. Other useful
   test cards: `4000 0000 0000 9995` (declined), `4000 0025 0000 3155` (asks for
   3-D Secure).

   While registration is open the pay page says when payment opens, and
   `createCheckoutSession` fails with `PAYMENT_NOT_OPEN`. That also holds when
   registration is reopened after it has closed: payments already made stay
   paid, the others wait. Moving the registration end time later resets the
   close email, so it goes out again when registration closes the next time.

8. **Check the emails.** In development the worker sends email through
   ethereal.email; the worker log prints the login and a preview URL for every
   message (confirmation, payment link on close, reminder, payment received).

### Refunds

Ilmo never refunds a payment and never cancels a registration for not paying.
Refunds are made by hand in the Stripe dashboard
(https://dashboard.stripe.com/payments); each payment's metadata in Stripe
(`registration_id`, `event_id`, `quota_id`, `payment_id`, `event_slug`) links it
to Ilmo. A refund made in Stripe does not change anything in Ilmo: the payment
stays paid there.

- **Deleting a paid registration** is allowed, by the participant (only while
  registration is open, so after it has been reopened) and by an admin. Both
  confirmations warn that nothing is refunded automatically. The payment is
  kept, no longer linked to a registration.
- **Payments Ilmo did not expect** are recorded as paid but not linked to a
  registration, and the server logs an error saying to refund them in Stripe if
  needed: a second payment for a registration that is already paid, a payment
  whose amount differs from what the payment row expects, and a payment
  completed after its registration was deleted. A paid Checkout Session with no
  payment row at all is only logged; the message says whether this Ilmo created
  it (its `ilmo_url` metadata equals this instance's `ROOT_URL`).
- **Changing a price** after some have paid is allowed. Paid registrations stay
  paid; unpaid ones pay the new price.

The payment summary in an event's _Registrations_ tab shows how many card
payments are not linked to a registration, with a hint to refund them in Stripe
when needed.

### Other admin tools

The _Registrations_ tab of a paid event shows the paid/unpaid summary, an All /
Unpaid / Paid filter, a _Send reminder to N unpaid_ button (emails the payment
link to everyone with a spot who has not paid) and, in each row's "⋯" menu,
_Mark as paid_ / _Undo manual payment_ for money collected outside Stripe. The
CSV download includes the payment status and price.

## Automated tests

The test suites never contact Stripe.

- Jest: `pnpm test`. The server tests mock the Stripe client and set the Stripe
  variables themselves; the server and worker tests switch the `payments` flag
  with `setFeatureFlag`. Every other test runs with the flag off.
- Cypress: `@app/e2e/cypress/e2e/payments_admin.spec.ts` and
  `payments_register.spec.ts` need a server started with Stripe configured
  (dummy values are enough) and a worker. The specs switch the `payments` flag
  on with the `setFeatureFlags` server command:

  ```sh
  STRIPE_SECRET_KEY=sk_test_dummy STRIPE_WEBHOOK_SECRET=whsec_dummy \
    pnpm --filter @app/server run start
  pnpm --filter @app/worker run start
  cd @app/e2e && pnpm run run:local
  ```

  The specs close registration with the `closeEventRegistration` Cypress server
  command, stub `createCheckoutSession` and the Checkout page, and complete
  payments with the `completeStripeCheckout` command
  (`@app/server/src/middleware/installCypressServerCommand.ts`, only available
  with `ENABLE_CYPRESS_COMMANDS=1` outside production), which posts a
  `checkout.session.completed` event signed with `STRIPE_WEBHOOK_SECRET` to the
  real webhook route. The sharded Cypress job in `.github/workflows/e2e.yml`
  appends the dummy values to `.env`.

## Staging and production setup

Do this once per Stripe account (use test mode for staging):

1. **API key:** _Developers → API keys_. Use the secret key, or a restricted key
   with write access to Checkout Sessions only (Ilmo creates, retrieves and
   expires Checkout Sessions; it reads nothing else and makes no refunds), as
   `STRIPE_SECRET_KEY`. Live keys (`sk_live_...`, `rk_live_...`) belong in the
   production environment only; staging and development use test-mode keys.
2. **Webhook endpoint:** _Developers → Webhooks → Add endpoint_:
   - Endpoint URL: `<ROOT_URL>/api/stripe/webhook`, e.g.
     `https://ilmo.prodeko.org/api/stripe/webhook`.
   - Events to send: exactly `checkout.session.completed` and
     `checkout.session.expired`.
   - Copy the endpoint's _Signing secret_ (`whsec_...`) to
     `STRIPE_WEBHOOK_SECRET`.
3. **Email receipts on:** _Settings → Customer emails_ (Business → Customer
   emails), turn on _Successful payments_, and _Refunds_ for the refunds you
   make by hand. Ilmo relies on Stripe's receipt in addition to its own payment
   received email.
4. **MobilePay off:** _Settings → Payment methods_, turn MobilePay (and any
   other non-card method) off. Checkout already asks only for cards
   (`allowed_payment_method_types: ["card"]`), so this keeps the dashboard
   consistent with what Ilmo offers. Apple Pay and Google Pay come with cards.
5. **Statement descriptor:** _Settings → Business → Public details_, set a
   descriptor participants will recognise (e.g. `PRODEKO`).
6. Set the two variables for the server and restart it.

## Turning payments off

Switch the `payments` feature flag off. Nothing is deleted: quotas keep their
prices, and payments stay in the database. A flag closes the ways in, never the
ways out. While it is off:

- no payment UI is shown and events act as free;
- the database refuses setting non-zero quota prices (errcode `FTOFF`) and the
  organizer payment actions (mark paid, undo, send reminders);
- `createCheckoutSession` fails with `PAYMENTS_DISABLED`; the pay page still
  shows a payment already made;
- payment reminders and the close-of-registration email are skipped. A send
  missed while the flag was off stays missed: the close email only covers events
  whose registration closed after the flag was last switched;
- the webhook keeps answering, so payments started before the switch still
  settle and the payment received email still goes out.

To stop taking payments for a single event instead, set the prices of its quotas
to 0 €. Payments already made stay paid.

**Removing the Stripe keys** makes the flag unavailable and also stops what the
flag leaves running: the webhook route `/api/stripe/webhook` is not registered,
so payments in progress are not recorded until the keys are back (Stripe retries
undelivered events for a few days). Keep any such period short.

## Keeping keys secret

Never commit `.env`. Real Stripe keys never go in `.env.ci`, the GitHub
workflows or any other file in the repository; CI uses only the dummy values
`sk_test_dummy` / `whsec_dummy`. Set production keys in the production
environment only.
