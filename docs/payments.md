# Stripe payments

Ilmo can charge for event quotas through Stripe Checkout (cards, Apple Pay and
Google Pay). The feature is behind one flag: payments are on only when **all
three** of these server environment variables are set, for both the server and
the worker:

| Variable                | Value                                                   |
| ----------------------- | ------------------------------------------------------- |
| `PAYMENTS_ENABLED`      | `1`                                                     |
| `STRIPE_SECRET_KEY`     | Stripe secret API key, `sk_test_...` (or `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the webhook endpoint, `whsec_...`     |

If any of them is missing the server logs
`PAYMENTS_ENABLED / STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET not all set; payments disabled`
at startup, no payment UI is shown and Ilmo behaves exactly as it does without
payments. The check lives in `paymentsEnabled()` in `@app/lib/src/payments.ts`.

Money is always stored as integer cents. A participant pays the ticket price
plus a 0,25 € service fee; Stripe keeps 0,25 € + 1,5 %. Refunds return the
ticket price only, never the service fee.

## Testing locally with your own Stripe test-mode keys

You need a Stripe account (a free personal one is fine; it stays in test mode)
and the [Stripe CLI](https://docs.stripe.com/stripe-cli).

1. **Get a test-mode secret key.** In the Stripe dashboard, switch to _Test
   mode_ and open _Developers → API keys_
   (https://dashboard.stripe.com/test/apikeys). Copy the _Secret key_
   (`sk_test_...`).

2. **Forward webhooks to your machine.** Log the CLI in once and start the
   forwarder, limited to the three events Ilmo handles (`HANDLED_STRIPE_EVENTS`
   in `@app/server/src/payments/webhook.ts`):

   ```sh
   stripe login
   stripe listen \
     --events checkout.session.completed,checkout.session.expired,charge.refunded \
     --forward-to localhost:5678/api/stripe/webhook
   ```

   It prints `Your webhook signing secret is whsec_...`. Keep it running while
   you test; the secret stays the same between runs of `stripe listen` for the
   same account. If your `PORT` is not 5678, change the URL to match.

3. **Set the variables in `.env`.** `pnpm setup` asks for the keys the first
   time it creates `.env` (the question is optional). Otherwise edit `.env`:

   ```sh
   PAYMENTS_ENABLED=1
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...   # the one printed by `stripe listen`
   ```

4. **Restart** `pnpm dev` (or the server and the worker) so that both pick up
   the new environment. The startup log no longer says `payments disabled`.

5. **Create a paid event.** Log in as an admin (or a member of the organizing
   organization) and go to _Admin → Create event_ (`/admin/event/create`):

   - _General_ tab, _Payments_ section: choose _Pay during registration_
     (participants go to Checkout right after registering) or _Pay after
     registration closes_ (everyone with a spot is emailed a payment link when
     registration closes).
   - _Quotas_ tab: set a _Ticket price_ for at least one quota. 0 € is free;
     otherwise the price must be between 0,25 € and 10 000 €. "Guild receives ≈"
     shows what is left after Stripe's fees.
   - Make sure registration is open now, and save without _Save as draft_.

6. **Register and pay.** Open the event, pick the paid quota and register. The
   button reads _Register and pay X €_ and takes you to Stripe Checkout. Pay
   with the test card **4242 4242 4242 4242**, any future expiry date, any CVC
   and any postal code. Stripe sends you back to `/pay/<updateToken>`, which
   shows a "Confirming your payment with Stripe" notice until the
   `checkout.session.completed` webhook arrives (watch the `stripe listen`
   terminal), then _Payment received_. The registration's update page and the
   admin _Registrations_ tab show it as paid. Other useful test cards:
   `4000 0000 0000 9995` (declined), `4000 0025 0000 3155` (asks for 3-D
   Secure).

   In after-registration mode, or when you leave Checkout without paying, open
   the payment link from the confirmation email (or `/pay/<updateToken>`) and
   press _Pay_.

7. **Check the emails.** In development the worker sends email through
   ethereal.email; the worker log prints the login and a preview URL for every
   message (confirmation with the payment link, payment received, reminder,
   refund).

### Verifying refunds

Refunds are made by the `payment__refund` worker task, so the worker must be
running. Each refund returns the ticket price only and is confirmed back to Ilmo
by the `charge.refunded` webhook.

- **Participant cancels:** open the registration's update link
  (`/update-registration/<updateToken>`, also in the confirmation email) while
  registration is still open and press _Delete registration_. The dialog shows
  what was paid, the service fee that is kept and the amount refunded to the
  card. Confirm with _Delete and refund X €_.
- **Admin deletes:** in the event's _Registrations_ tab press _Delete_ on a row
  paid by card. The dialog has _Refund the ticket price, X €, to their card_,
  ticked by default; untick it to delete without a refund. Manual payments are
  never refunded by Ilmo.
- **Refund from the Stripe dashboard:** refunding a payment in the dashboard
  also reaches Ilmo through `charge.refunded`; the payment counts as refunded
  once at least the ticket price is returned.

To verify: the worker log shows `payment__refund` completing, `stripe listen`
shows `charge.refunded` forwarded with a 200 response, the payment appears as
refunded under _Payments_ in the Stripe test dashboard
(https://dashboard.stripe.com/test/payments), and the participant gets the
refund email. Each payment's metadata in Stripe (`registration_id`, `event_id`,
`quota_id`, `payment_id`, `event_slug`) links it to Ilmo.

### Other admin tools

The _Registrations_ tab of a paid event shows the paid/unpaid summary, an All /
Unpaid / Paid filter, a _Send reminder to N unpaid_ button (emails the payment
link to everyone with a spot who has not paid) and, in each row's "⋯" menu,
_Mark as paid_ / _Undo manual payment_ for money collected outside Stripe. The
CSV download includes the payment status and price.

## Automated tests

The test suites never contact Stripe.

- Jest: `pnpm test`. The server and worker tests mock the Stripe client and set
  the environment variables themselves.
- Cypress: `@app/e2e/cypress/e2e/payments_admin.spec.ts` and
  `payments_register.spec.ts` need a server and worker started with payments
  enabled; dummy values are enough:

  ```sh
  PAYMENTS_ENABLED=1 STRIPE_SECRET_KEY=sk_test_dummy STRIPE_WEBHOOK_SECRET=whsec_dummy \
    pnpm --filter @app/server run start
  PAYMENTS_ENABLED=1 STRIPE_SECRET_KEY=sk_test_dummy STRIPE_WEBHOOK_SECRET=whsec_dummy \
    pnpm --filter @app/worker run start
  cd @app/e2e && pnpm run run:local
  ```

  The specs stub `createCheckoutSession` and the Checkout page, and complete
  payments with the `completeStripeCheckout` Cypress server command
  (`@app/server/src/middleware/installCypressServerCommand.ts`, only available
  with `ENABLE_CYPRESS_COMMANDS=1` outside production), which posts a
  `checkout.session.completed` event signed with `STRIPE_WEBHOOK_SECRET` to the
  real webhook route. With payments off these two specs skip themselves. The
  sharded Cypress job in `.github/workflows/e2e.yml` appends the dummy values to
  `.env`, so CI runs every spec with payments on. Refund jobs queued by these
  tests fail against Stripe with the dummy key and are cleaned up by the next
  test; that is expected.

## Staging and production setup

Do this once per Stripe account (use test mode for staging):

1. **API key:** _Developers → API keys_. Use the secret key (or a restricted key
   with write access to Checkout Sessions and Refunds) as `STRIPE_SECRET_KEY`.
2. **Webhook endpoint:** _Developers → Webhooks → Add endpoint_:
   - Endpoint URL: `<ROOT_URL>/api/stripe/webhook`, e.g.
     `https://ilmo.prodeko.org/api/stripe/webhook`.
   - Events to send: exactly `checkout.session.completed`,
     `checkout.session.expired` and `charge.refunded`.
   - Copy the endpoint's _Signing secret_ (`whsec_...`) to
     `STRIPE_WEBHOOK_SECRET`.
3. **Email receipts on:** _Settings → Customer emails_ (Business → Customer
   emails), turn on _Successful payments_ and _Refunds_. Ilmo relies on Stripe's
   receipt in addition to its own payment received email.
4. **MobilePay off:** _Settings → Payment methods_, turn MobilePay (and any
   other non-card method) off. Checkout already asks only for cards
   (`payment_method_types: ["card"]`), so this keeps the dashboard consistent
   with what Ilmo offers. Apple Pay and Google Pay come with cards.
5. **Statement descriptor:** _Settings → Business → Public details_, set a
   descriptor participants will recognise (e.g. `PRODEKO`).
6. Set the three variables for both the server and the worker and restart them.

Rollout: merge with the flag unset in production, test the whole flow on staging
with test-mode keys, then enable in production for one real event and reconcile
the Stripe payout against the event's payment summary before using it generally.

## Turning payments off

Remove `PAYMENTS_ENABLED` (or set it to anything other than `1`) for the server
and the worker, and restart both. Nothing is deleted: events keep their payment
mode and prices, and payments stay in the database. While the flag is off no
payment UI is shown, nothing is charged or refunded, no reminders are sent and
the webhook route `/api/stripe/webhook` is not registered (Stripe retries
undelivered events for a few days). Turning the flag back on resumes where
things were left. To stop taking payments for a single event instead, set its
payment mode to _No payments_.
