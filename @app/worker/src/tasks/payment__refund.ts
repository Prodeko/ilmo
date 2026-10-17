import { getStripe, PaymentRow, paymentsEnabled } from "../payments"

import type { PaymentRefundEmailPayload } from "./payment__send_refund_email"
import type { Task } from "graphile-worker"

export interface PaymentRefundPayload {
  paymentId: string
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
const task: Task = async (inPayload, { withPgClient, logger }) => {
  const { paymentId, full = false } = inPayload as PaymentRefundPayload

  if (!paymentsEnabled()) {
    // Don't lose the refund: fail, so it is retried once payments are back on
    throw new Error(
      `Payments are disabled; the refund of payment ${paymentId} will be retried`
    )
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
        logger.error(
          `Payment ${paymentId} has no Stripe payment intent; refund it in the Stripe dashboard`
        )
        await client.query("rollback")
        return
      }

      const paidCents = payment.ticket_amount_cents + payment.service_fee_cents
      const amount = full ? paidCents : payment.ticket_amount_cents

      const refund = await getStripe().refunds.create(
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
      if (refund.status === "failed" || refund.status === "canceled") {
        throw new Error(
          `Stripe refund ${refund.id} of payment ${paymentId} is ${refund.status}`
        )
      }

      // The charge.refunded webhook records the same; doing it here too
      // shows the refund right away. A full or ticket price refund makes the
      // payment REFUNDED.
      await client.query(
        `update app_public.payments
          set
            status = 'REFUNDED',
            refunded_amount_cents = greatest(refunded_amount_cents, $2),
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
