import {
  getStripe,
  PaymentRow,
  paymentsConfigured,
  subjectEventName,
} from "../payments"

import type { SendEmailPayload } from "./send_email"
import type { JobHelpers, Task } from "graphile-worker"

export interface PaymentRefundEmailPayload {
  paymentId: string
  /** The amount refunded, in cents. Defaults to the payment's refunded amount. */
  amountCents?: number
  /** The whole charge was refunded (a duplicate payment). */
  full?: boolean
}

const { ROOT_URL } = process.env

/**
 * Where to send the refund email. Payment rows hold no personal data: use the
 * registration's email while it still exists, otherwise (a deleted
 * registration, or a duplicate payment detached from its registration) the
 * email the customer gave Stripe Checkout.
 */
async function recipientOf(
  query: JobHelpers["query"],
  payment: PaymentRow
): Promise<string | null> {
  if (payment.registration_id) {
    const {
      rows: [registration],
    } = await query<{ email: string | null }>(
      "select email from app_public.registrations where id = $1",
      [payment.registration_id]
    )
    if (registration?.email) {
      return registration.email
    }
  }
  if (payment.stripe_checkout_session_id) {
    const session = await getStripe().checkout.sessions.retrieve(
      payment.stripe_checkout_session_id
    )
    return session.customer_details?.email || session.customer_email || null
  }
  return null
}

/** Refund issued email. */
const task: Task = async (inPayload, { addJob, query, logger }) => {
  const {
    paymentId,
    amountCents,
    full = false,
  } = inPayload as PaymentRefundEmailPayload

  // Not gated by the `payments` flag (a refund is a way out); the recipient
  // lookup may need Stripe.
  if (!paymentsConfigured()) {
    logger.info(
      `Stripe is not configured; not sending the refund email of payment ${paymentId}`
    )
    return
  }

  const {
    rows: [payment],
  } = await query<PaymentRow>(
    "select * from app_public.payments where id = $1",
    [paymentId]
  )
  if (!payment) {
    logger.error(`Payment ${paymentId} not found; not sending a refund email`)
    return
  }

  const email = await recipientOf(query, payment)
  if (!email) {
    logger.error(
      `No email address for the refund of payment ${paymentId}; not sending a refund email`
    )
    return
  }

  const paid = payment.ticket_amount_cents + payment.service_fee_cents
  const refund = amountCents ?? payment.refunded_amount_cents
  const sendEmailPayload: SendEmailPayload = {
    options: {
      to: email,
      subject: `${subjectEventName(payment.event_name)} - Hyvitys / Refund`,
    },
    template: "payment_refund.mjml.njk",
    variables: {
      url: ROOT_URL,
      eventName: payment.event_name,
      paid,
      serviceFee: payment.service_fee_cents,
      refund,
      full,
    },
  }
  await addJob("send_email", sendEmailPayload)
}

export default task
