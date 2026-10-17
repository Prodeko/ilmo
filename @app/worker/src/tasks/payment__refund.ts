import { getStripe, PaymentRow, paymentsEnabled } from "../payments"

import type { PaymentRefundEmailPayload } from "./payment__send_refund_email"
import type { Task } from "graphile-worker"

export interface PaymentRefundPayload {
  paymentId?: string
  /**
   * Refund a Stripe payment intent that has no payment row at all, in full
   * (a Checkout Session of this Ilmo that was paid after its payment row was
   * lost). Used only without paymentId; no email is sent, as there is no
   * registration to address it to.
   */
  paymentIntentId?: string
  /**
   * Refund the whole charge, service fee included. Used for a duplicate
   * payment of an already paid registration; otherwise only the ticket price
   * is refunded and the service fee is kept (PRD §6.11).
   */
  full?: boolean
}

/**
 * Refunds a card payment through Stripe and queues the refund email.
 *
 * Queued by the database when a paid registration is deleted (ticket price)
 * and by the webhook for payments that can't be kept (ticket price for a
 * deleted registration, the full amount for a duplicate payment).
 *
 * Stripe errors are thrown so graphile-worker retries the job; the
 * idempotency key `refund-<paymentId>` makes a retry return the refund
 * already made instead of refunding twice. The payment row is updated and the
 * email queued in one transaction, so a retry after a failure there makes the
 * same (idempotent) Stripe call and then both.
 */
/** Stripe's answer when nothing is left to refund: treated as done. */
function alreadyRefunded(e: unknown): null {
  if ((e as { code?: string })?.code === "charge_already_refunded") {
    return null
  }
  throw e
}

const task: Task = async (inPayload, { withPgClient, logger }) => {
  const {
    paymentId,
    paymentIntentId,
    full = false,
  } = inPayload as PaymentRefundPayload

  if (!paymentsEnabled()) {
    // Don't lose the refund: fail, so it is retried once payments are back on
    throw new Error(
      `Payments are disabled; the refund of payment ${paymentId ?? paymentIntentId} will be retried`
    )
  }

  if (!paymentId) {
    if (!paymentIntentId) {
      logger.error("payment__refund needs a paymentId or a paymentIntentId")
      return
    }
    // No row to lock or update: the idempotency key alone prevents a second
    // refund, and Stripe refuses refunding an already refunded charge.
    const refund = await getStripe()
      .refunds.create(
        { payment_intent: paymentIntentId },
        { idempotencyKey: `refund-pi-${paymentIntentId}` }
      )
      .catch(alreadyRefunded)
    if (!refund) {
      logger.info(`Payment intent ${paymentIntentId} is already refunded`)
      return
    }
    if (refund.status === "failed" || refund.status === "canceled") {
      throw new Error(
        `Stripe refund ${refund.id} of payment intent ${paymentIntentId} is ${refund.status}`
      )
    }
    logger.info(
      `Refunded payment intent ${paymentIntentId}, which had no payment row (Stripe refund ${refund.id})`
    )
    return
  }

  await withPgClient(async (client) => {
    await client.query("begin")
    try {
      const {
        rows: [payment],
      } = await client.query<PaymentRow>(
        "select * from app_public.payments where id = $1 for update",
        [paymentId]
      )
      if (!payment) {
        logger.error(`Payment ${paymentId} not found; not refunding`)
        await client.query("rollback")
        return
      }
      if (payment.method !== "STRIPE") {
        logger.error(
          `Payment ${paymentId} is a ${payment.method} payment; Ilmo refunds card payments only`
        )
        await client.query("rollback")
        return
      }
      if (payment.status === "REFUNDED") {
        logger.info(`Payment ${paymentId} has already been refunded`)
        await client.query("rollback")
        return
      }
      if (payment.status !== "PAID") {
        logger.error(
          `Payment ${paymentId} is ${payment.status}, not PAID; not refunding`
        )
        await client.query("rollback")
        return
      }
      if (!payment.stripe_payment_intent_id) {
        // Unreachable in practice (the webhook always stores it); fail so the
        // job stays visible in graphile_worker.jobs instead of vanishing
        throw new Error(
          `Payment ${paymentId} has no Stripe payment intent; refund it in the Stripe dashboard`
        )
      }

      // A partial refund made in the Stripe dashboard leaves the payment
      // PAID; it counts towards what is refunded now (the ticket price, or
      // everything with full), so the service fee is still kept and Stripe
      // isn't asked for more than is left.
      const paidCents = payment.ticket_amount_cents + payment.service_fee_cents
      const amount =
        (full ? paidCents : payment.ticket_amount_cents) -
        payment.refunded_amount_cents
      if (amount <= 0) {
        logger.info(
          `Payment ${paymentId} has already been refunded in Stripe; nothing to refund`
        )
        await client.query("rollback")
        return
      }

      // Stripe keeps idempotency keys for about 24 hours, while
      // graphile-worker retries for about 3 days. A late retry is still safe:
      // the charge.refunded webhook marks the row REFUNDED and this job
      // returns early on REFUNDED (the row lock above serializes the two).
      // That protection needs the webhook to receive charge.refunded.
      //
      // Known gap: if the worker dies after Stripe refunded but before the
      // commit below, and the webhook marks the row REFUNDED first, the
      // retry returns early and the refund email is never sent (the money is
      // still returned).
      const refund = await getStripe()
        .refunds.create(
          {
            payment_intent: payment.stripe_payment_intent_id,
            amount,
            metadata: {
              payment_id: payment.id,
              event_id: payment.event_id ?? "",
              quota_id: payment.quota_id ?? "",
              registration_id: payment.registration_id ?? "",
            },
          },
          { idempotencyKey: `refund-${payment.id}` }
        )
        .catch(alreadyRefunded)
      if (!refund) {
        // Refunded in Stripe already (the dashboard, or a run whose commit
        // failed); the charge.refunded webhook records it
        logger.info(`Payment ${paymentId} is already refunded in Stripe`)
        await client.query("rollback")
        return
      }
      if (refund.status === "failed" || refund.status === "canceled") {
        throw new Error(
          `Stripe refund ${refund.id} of payment ${paymentId} is ${refund.status}`
        )
      }

      // The charge.refunded webhook records the same (and corrects the total
      // from Stripe's amount_refunded); doing it here too shows the refund
      // right away. A full or ticket price refund makes the payment REFUNDED.
      await client.query(
        `update app_public.payments
          set
            status = 'REFUNDED',
            refunded_amount_cents = least(refunded_amount_cents + $2, ticket_amount_cents + service_fee_cents),
            refunded_at = coalesce(refunded_at, now()),
            stripe_refund_id = $3
          where id = $1`,
        [payment.id, amount, refund.id]
      )

      const emailPayload: PaymentRefundEmailPayload = {
        paymentId: payment.id,
        amountCents: amount,
        full,
      }
      await client.query("select graphile_worker.add_job($1, $2::json)", [
        "payment__send_refund_email",
        JSON.stringify(emailPayload),
      ])
      await client.query("commit")
      logger.info(
        `Refunded ${amount} cents of payment ${paymentId} (Stripe refund ${refund.id})`
      )
    } catch (e) {
      await client.query("rollback")
      throw e
    }
  })
}

export default task
