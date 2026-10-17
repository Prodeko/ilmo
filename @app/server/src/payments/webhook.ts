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
  "charge.refunded",
] as const

interface PaymentRow {
  id: string
  registration_id: string | null
  status: "PENDING" | "PAID" | "EXPIRED" | "REFUNDED"
  ticket_amount_cents: number
}

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
    `select id, registration_id, status, ticket_amount_cents
      from app_public.payments where stripe_checkout_session_id = $1`,
    [session.id]
  )
  if (bySession) return bySession

  const paymentId = session.metadata?.payment_id
  if (!paymentId || !/^[0-9a-f-]{36}$/i.test(paymentId)) return null
  const {
    rows: [byMetadata],
  } = await client.query<PaymentRow>(
    `select id, registration_id, status, ticket_amount_cents
      from app_public.payments
      where id = $1 and method = 'STRIPE' and stripe_checkout_session_id is null`,
    [paymentId]
  )
  return byMetadata ?? null
}

/**
 * A Checkout Session was paid. The registration becomes paid only here,
 * never from the success redirect.
 *
 * Locks the registration before the payment (the same order as Checkout
 * creation and deletion) and then decides:
 * - the registration is gone: keep the money as PAID and refund the ticket
 *   price (PRD §6.8);
 * - it already has another PAID payment (a second session, or a manual
 *   payment): refund this one in full, fee included. One registration can
 *   have only one PAID row, so the duplicate is detached from the
 *   registration; its Stripe metadata still names it;
 * - otherwise: mark it PAID and send the payment received email.
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
    logger.error(
      `Stripe Checkout Session ${session.id} was paid but has no payment row (metadata: ${JSON.stringify(
        session.metadata
      )})`
    )
    return "ignored"
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
    `select id, registration_id, status, ticket_amount_cents
      from app_public.payments where id = $1 for update`,
    [found.id]
  )
  if (payment.status === "PAID" || payment.status === "REFUNDED") {
    // Already handled (for example through the metadata fallback)
    return "ignored"
  }

  const paymentIntentId = idOf(session.payment_intent)
  let duplicate = false
  if (payment.registration_id) {
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
    [payment.id, session.id, paymentIntentId, duplicate]
  )

  if (!payment.registration_id) {
    logger.info(
      `Payment ${payment.id} completed for a deleted registration; refunding the ticket price`
    )
    await addJob(client, "payment__refund", { paymentId: payment.id })
  } else if (duplicate) {
    logger.info(
      `Payment ${payment.id} is a second payment for registration ${payment.registration_id}; refunding it in full`
    )
    await addJob(client, "payment__refund", {
      paymentId: payment.id,
      full: true,
    })
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
 * A charge was refunded, by the refund job or from the Stripe dashboard.
 * Records the refunded amount; the payment counts as REFUNDED once at least
 * the ticket price is back with the customer (Ilmo's refunds keep the
 * service fee). A smaller, partial dashboard refund is recorded but the
 * registration stays paid.
 */
async function handleChargeRefunded(
  client: PoolClient,
  charge: Stripe.Charge,
  logger: Logger
): Promise<WebhookOutcome> {
  const paymentIntentId = idOf(charge.payment_intent)
  const refundId = charge.refunds?.data?.[0]?.id ?? null
  const { rowCount } = paymentIntentId
    ? await client.query(
        `update app_public.payments
          set
            refunded_amount_cents = $2,
            refunded_at = coalesce(refunded_at, now()),
            stripe_refund_id = coalesce($3, stripe_refund_id),
            status = case
              when status = 'PAID' and $2 >= ticket_amount_cents then 'REFUNDED'
              else status
            end
          where stripe_payment_intent_id = $1 and method = 'STRIPE'`,
        [paymentIntentId, charge.amount_refunded, refundId]
      )
    : { rowCount: 0 }
  if (!rowCount) {
    logger.warn(
      `Ignoring charge.refunded for charge ${charge.id}: no payment with payment intent ${paymentIntentId}`
    )
    return "ignored"
  }
  return "processed"
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
    case "charge.refunded":
      return handleChargeRefunded(client, event.data.object, logger)
    default:
      return "ignored"
  }
}
