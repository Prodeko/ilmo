import { PoolClient } from "pg"

import type Stripe from "stripe"

/** Console or a Fastify request logger. */
type Logger = {
  error(message: string): void
  warn(message: string): void
  info(message: string): void
}

export type WebhookOutcome = "processed" | "duplicate" | "ignored"

/** The Stripe events Ilmo handles; configure exactly these in the dashboard. */
export const HANDLED_STRIPE_EVENTS = [
  "checkout.session.completed",
  "checkout.session.expired",
] as const

interface PaymentRow {
  id: string
  registration_id: string | null
  status: "PENDING" | "PAID" | "EXPIRED"
  ticket_amount_cents: number
  service_fee_cents: number
  currency: string
}

const PAYMENT_COLUMNS =
  "id, registration_id, status, ticket_amount_cents, service_fee_cents, currency"

/**
 * Metadata key naming the Ilmo instance (its ROOT_URL) that created a
 * Checkout Session. Several instances (production, staging, developers) can
 * share one Stripe account, so the log of an unknown paid session says
 * whether this instance created it.
 */
export const INSTANCE_METADATA_KEY = "ilmo_url"

function idOf(value: string | { id: string } | null | undefined) {
  if (!value) return null
  return typeof value === "string" ? value : value.id
}

async function addJob(
  client: PoolClient,
  identifier: string,
  payload: Record<string, unknown>
) {
  await client.query("select graphile_worker.add_job($1, $2::json)", [
    identifier,
    JSON.stringify(payload),
  ])
}

/**
 * Finds the payment row of a Checkout Session: by session id, or else by the
 * payment id in the session's metadata (the row is created before the
 * session, so it exists even if storing the session id failed).
 */
async function findSessionPayment(
  client: PoolClient,
  session: Stripe.Checkout.Session
): Promise<PaymentRow | null> {
  const {
    rows: [bySession],
  } = await client.query<PaymentRow>(
    `select ${PAYMENT_COLUMNS}
      from app_public.payments where stripe_checkout_session_id = $1`,
    [session.id]
  )
  if (bySession) return bySession

  const paymentId = session.metadata?.payment_id
  if (!paymentId || !/^[0-9a-f-]{36}$/i.test(paymentId)) return null
  const {
    rows: [byMetadata],
  } = await client.query<PaymentRow>(
    `select ${PAYMENT_COLUMNS}
      from app_public.payments
      where id = $1 and method = 'STRIPE' and stripe_checkout_session_id is null`,
    [paymentId]
  )
  return byMetadata ?? null
}

/**
 * A paid session without a payment row. Ilmo never refunds, so this is only
 * logged: an organizer can refund it by hand in Stripe.
 */
function handleUnknownPaidSession(
  session: Stripe.Checkout.Session,
  logger: Logger
): WebhookOutcome {
  const ours =
    !!process.env.ROOT_URL &&
    session.metadata?.[INSTANCE_METADATA_KEY] === process.env.ROOT_URL
  logger.error(
    `Stripe Checkout Session ${session.id} (payment intent ${idOf(
      session.payment_intent
    )}) was paid but has no payment row; ${
      ours ? "it was created by this Ilmo" : "it was not created by this Ilmo"
    } (metadata: ${JSON.stringify(session.metadata)}). Refund it in Stripe if needed.`
  )
  return "ignored"
}

/**
 * A Checkout Session was paid. The registration becomes paid only here,
 * never from the success redirect.
 *
 * Locks the registration before the payment (the same order as Checkout
 * creation and deletion) and then records the payment as PAID. Ilmo never
 * refunds; a payment that can't be applied to its registration is kept as a
 * PAID row without a registration and logged, and the organizers' payment
 * summary counts it so that they can refund it by hand in Stripe:
 * - the registration is gone (deleted while Checkout was open);
 * - it already has another PAID payment (a second session, or a manual
 *   payment). One registration can have only one PAID row; the Stripe
 *   metadata of the detached row still names the registration;
 * - the session's amount or currency differs from the payment row.
 * Otherwise the payment received email is sent.
 *
 * A paid session with no payment row at all is only logged (see
 * handleUnknownPaidSession).
 */
async function handleSessionCompleted(
  client: PoolClient,
  session: Stripe.Checkout.Session,
  logger: Logger
): Promise<WebhookOutcome> {
  if (session.payment_status !== "paid") {
    return "ignored"
  }
  const found = await findSessionPayment(client, session)
  if (!found) {
    return handleUnknownPaidSession(session, logger)
  }

  if (found.registration_id) {
    await client.query(
      "select 1 from app_public.registrations where id = $1 for update",
      [found.registration_id]
    )
  }
  const {
    rows: [payment],
  } = await client.query<PaymentRow>(
    `select ${PAYMENT_COLUMNS}
      from app_public.payments where id = $1 for update`,
    [found.id]
  )
  if (payment.status === "PAID") {
    // Already handled (for example through the metadata fallback)
    return "ignored"
  }

  // Ilmo created the session from this row, so anything else means the
  // session is not what it should be: don't apply it to the registration.
  const expectedCents = payment.ticket_amount_cents + payment.service_fee_cents
  const chargedCents = session.amount_total
  const chargedCurrency = session.currency
  const amountMismatch =
    chargedCents !== expectedCents ||
    chargedCurrency?.toLowerCase() !== payment.currency.toLowerCase()

  let duplicate = false
  if (payment.registration_id && !amountMismatch) {
    const { rows: otherPaid } = await client.query(
      `select 1 from app_public.payments
        where registration_id = $1 and status = 'PAID' and id <> $2`,
      [payment.registration_id, payment.id]
    )
    duplicate = otherPaid.length > 0
  }

  await client.query(
    `update app_public.payments
      set
        status = 'PAID',
        paid_at = now(),
        stripe_checkout_session_id = $2,
        stripe_payment_intent_id = $3,
        registration_id = case when $4::boolean then null else registration_id end
      where id = $1`,
    [
      payment.id,
      session.id,
      idOf(session.payment_intent),
      duplicate || amountMismatch,
    ]
  )

  const refundHint =
    "kept without a registration; refund it in Stripe if needed"
  if (amountMismatch) {
    logger.error(
      `Checkout Session ${session.id} charged ${chargedCents} ${chargedCurrency}, but payment ${payment.id} expects ${expectedCents} ${payment.currency}; ${refundHint}`
    )
  } else if (duplicate) {
    logger.error(
      `Payment ${payment.id} is a second payment for registration ${payment.registration_id}; ${refundHint}`
    )
  } else if (!payment.registration_id) {
    logger.error(
      `Payment ${payment.id} completed for a deleted registration; ${refundHint}`
    )
  } else {
    await addJob(client, "payment__send_received_email", {
      paymentId: payment.id,
    })
  }
  return "processed"
}

async function handleSessionExpired(
  client: PoolClient,
  session: Stripe.Checkout.Session
): Promise<WebhookOutcome> {
  const { rowCount } = await client.query(
    `update app_public.payments set status = 'EXPIRED'
      where stripe_checkout_session_id = $1 and status = 'PENDING'`,
    [session.id]
  )
  return rowCount ? "processed" : "ignored"
}

/**
 * Applies a verified Stripe event. The caller runs this in a transaction and
 * commits it: the event id is recorded first, so a redelivered event is
 * skipped, and a failure rolls the record back so that Stripe's retry is
 * processed again.
 */
export async function handleStripeEvent(
  client: PoolClient,
  event: Stripe.Event,
  logger: Logger = console
): Promise<WebhookOutcome> {
  const { rowCount } = await client.query(
    `insert into app_private.stripe_events(id, type) values ($1, $2)
      on conflict (id) do nothing`,
    [event.id, event.type]
  )
  if (!rowCount) {
    return "duplicate"
  }

  switch (event.type) {
    case "checkout.session.completed":
      return handleSessionCompleted(client, event.data.object, logger)
    case "checkout.session.expired":
      return handleSessionExpired(client, event.data.object)
    default:
      return "ignored"
  }
}
