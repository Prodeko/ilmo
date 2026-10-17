import { PoolClient } from "pg"

import type Stripe from "stripe"

/** Console or a Fastify request logger. */
type Logger = {
  error(message: string): void
  warn(message: string): void
  info(message: string): void
}

export type WebhookOutcome = "processed" | "deferred" | "duplicate" | "ignored"

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
  service_fee_cents: number
  currency: string
}

const PAYMENT_COLUMNS =
  "id, registration_id, status, ticket_amount_cents, service_fee_cents, currency"

/**
 * Metadata key naming the Ilmo instance (its ROOT_URL) that created a
 * Checkout Session. Several instances (production, staging, developers) can
 * share one Stripe account, so an unknown session is refunded only when it
 * names this instance.
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
 * Serializes checkout.session.completed and charge.refunded for one payment
 * intent, so an early refund can't be stored just after the completed
 * handler looked for it.
 */
async function lockPaymentIntent(client: PoolClient, paymentIntentId: string) {
  await client.query("select pg_advisory_xact_lock(hashtext($1))", [
    paymentIntentId,
  ])
}

/**
 * Records Stripe's cumulative refunded amount of a payment intent. The
 * payment counts as REFUNDED once at least the ticket price is back with the
 * customer (Ilmo's refunds keep the service fee); a smaller, partial
 * dashboard refund is recorded but the registration stays paid. The amount
 * only grows, so charge.refunded events arriving out of order can't lower it.
 * Returns the number of payments updated.
 */
async function recordRefund(
  client: PoolClient,
  paymentIntentId: string,
  amountRefundedCents: number,
  refundId: string | null
): Promise<number> {
  const { rowCount } = await client.query(
    `update app_public.payments
      set
        refunded_amount_cents = greatest(refunded_amount_cents, $2),
        refunded_at = coalesce(refunded_at, now()),
        stripe_refund_id = coalesce($3, stripe_refund_id),
        status = case
          when status = 'PAID' and greatest(refunded_amount_cents, $2) >= ticket_amount_cents
            then 'REFUNDED'
          else status
        end
      where stripe_payment_intent_id = $1 and method = 'STRIPE'`,
    [paymentIntentId, amountRefundedCents, refundId]
  )
  return rowCount ?? 0
}

/**
 * A paid session without a payment row: refund it in full by its payment
 * intent, but only when its metadata says this Ilmo instance created it.
 */
async function handleUnknownPaidSession(
  client: PoolClient,
  session: Stripe.Checkout.Session,
  logger: Logger
): Promise<WebhookOutcome> {
  const paymentIntentId = idOf(session.payment_intent)
  const ours =
    !!session.metadata?.payment_id &&
    !!process.env.ROOT_URL &&
    session.metadata?.[INSTANCE_METADATA_KEY] === process.env.ROOT_URL
  if (!ours || !paymentIntentId) {
    logger.error(
      `Stripe Checkout Session ${session.id} was paid but has no payment row and was not created by this Ilmo (metadata: ${JSON.stringify(
        session.metadata
      )}); not refunding it`
    )
    return "ignored"
  }
  logger.error(
    `Stripe Checkout Session ${session.id} was paid but has no payment row; refunding payment intent ${paymentIntentId} in full`
  )
  await addJob(client, "payment__refund", { paymentIntentId })
  return "processed"
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
 * - the session's amount or currency differs from the payment row: keep
 *   nothing, refund whatever was charged by its payment intent;
 * - otherwise: mark it PAID and send the payment received email.
 *
 * A refund recorded early (see handleChargeRefunded) is applied here; if it
 * already returned the ticket price, nothing else is queued.
 *
 * A paid session with no payment row at all is refunded in full when it was
 * created by this Ilmo (see handleUnknownPaidSession).
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
    return handleUnknownPaidSession(client, session, logger)
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
  if (payment.status === "PAID" || payment.status === "REFUNDED") {
    // Already handled (for example through the metadata fallback)
    return "ignored"
  }

  const paymentIntentId = idOf(session.payment_intent)
  if (paymentIntentId) {
    await lockPaymentIntent(client, paymentIntentId)
  }

  // Ilmo created the session from this row, so anything else means the
  // session is not what it should be: keep no such payment.
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
    [payment.id, session.id, paymentIntentId, duplicate || amountMismatch]
  )

  // charge.refunded may have arrived before this event
  let refundedCents = 0
  if (paymentIntentId) {
    const {
      rows: [early],
    } = await client.query<{
      amount_refunded_cents: number
      stripe_refund_id: string | null
    }>(
      `delete from app_private.stripe_early_refunds
        where stripe_payment_intent_id = $1
        returning amount_refunded_cents, stripe_refund_id`,
      [paymentIntentId]
    )
    if (early) {
      await recordRefund(
        client,
        paymentIntentId,
        early.amount_refunded_cents,
        early.stripe_refund_id
      )
      refundedCents = early.amount_refunded_cents
    }
  }
  // At least the ticket price is back with the customer already
  const refunded = refundedCents >= payment.ticket_amount_cents

  if (amountMismatch || duplicate) {
    if (amountMismatch) {
      logger.error(
        `Checkout Session ${session.id} charged ${chargedCents} ${chargedCurrency}, but payment ${payment.id} expects ${expectedCents} ${payment.currency}; refunding it in full`
      )
    } else {
      logger.info(
        `Payment ${payment.id} is a second payment for registration ${payment.registration_id}; refunding it in full`
      )
    }
    if (amountMismatch || refunded) {
      // By payment intent: refunds whatever of the charge is left
      if (refundedCents < (chargedCents ?? expectedCents)) {
        await addJob(client, "payment__refund", { paymentIntentId })
      }
    } else {
      await addJob(client, "payment__refund", {
        paymentId: payment.id,
        full: true,
      })
    }
  } else if (refunded) {
    logger.info(
      `Payment ${payment.id} was refunded before its payment was recorded`
    )
  } else if (!payment.registration_id) {
    logger.info(
      `Payment ${payment.id} completed for a deleted registration; refunding the ticket price`
    )
    await addJob(client, "payment__refund", { paymentId: payment.id })
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
 * Stripe does not order events, so a refund can arrive before
 * checkout.session.completed has stored the payment intent: it is then kept
 * in app_private.stripe_early_refunds and applied by that event.
 */
async function handleChargeRefunded(
  client: PoolClient,
  charge: Stripe.Charge,
  logger: Logger
): Promise<WebhookOutcome> {
  const paymentIntentId = idOf(charge.payment_intent)
  if (!paymentIntentId) {
    logger.warn(
      `Ignoring charge.refunded for charge ${charge.id}: it has no payment intent`
    )
    return "ignored"
  }
  await lockPaymentIntent(client, paymentIntentId)
  // Present only when the event includes the refunds list (older API
  // versions); the refund job stores the id of its own refunds anyway
  const refundId = charge.refunds?.data?.[0]?.id ?? null
  const updated = await recordRefund(
    client,
    paymentIntentId,
    charge.amount_refunded,
    refundId
  )
  if (updated) {
    return "processed"
  }
  logger.warn(
    `charge.refunded for charge ${charge.id}: no payment with payment intent ${paymentIntentId} yet; keeping it until its checkout.session.completed arrives`
  )
  // Refunds of payments that never show up here (another Ilmo on the same
  // Stripe account, dashboard charges) would pile up: keep them 30 days
  await client.query(
    `delete from app_private.stripe_early_refunds
      where received_at < now() - interval '30 days'`
  )
  await client.query(
    `insert into app_private.stripe_early_refunds as e
        (stripe_payment_intent_id, amount_refunded_cents, stripe_refund_id)
      values ($1, $2, $3)
      on conflict (stripe_payment_intent_id) do update set
        amount_refunded_cents = greatest(e.amount_refunded_cents, excluded.amount_refunded_cents),
        stripe_refund_id = coalesce(excluded.stripe_refund_id, e.stripe_refund_id)`,
    [paymentIntentId, charge.amount_refunded, refundId]
  )
  return "deferred"
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
