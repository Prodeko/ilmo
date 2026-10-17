import {
  formatDateTime,
  PaymentRow,
  paymentsEnabled,
  subjectEventName,
} from "../payments"

import { getFormattedEventTime } from "./registration__send_confirmation_email"

import type { SendEmailPayload } from "./send_email"
import type { Task } from "graphile-worker"

interface PaymentReceivedEmailPayload {
  paymentId: string
}

const { ROOT_URL } = process.env

/**
 * Payment received email (board 14), sent when the webhook marks a card
 * payment paid and when an organizer marks a registration paid by hand. A
 * manual payment has no service fee, so its row is left out and the total is
 * the ticket price.
 */
const task: Task = async (inPayload, { addJob, query, logger }) => {
  const { paymentId } = inPayload as PaymentReceivedEmailPayload

  if (!paymentsEnabled()) {
    logger.info(
      `Payments are disabled; not sending the payment received email of payment ${paymentId}`
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
    logger.error(`Payment ${paymentId} not found; aborting`)
    return
  }
  // Undone (manual) or refunded in the meantime
  if (payment.status !== "PAID") {
    logger.info(`Payment ${paymentId} is ${payment.status}; not sending`)
    return
  }
  if (!payment.registration_id) {
    logger.info(`The registration of payment ${paymentId} is gone; not sending`)
    return
  }

  const {
    rows: [registration],
  } = await query("select * from app_public.registrations where id = $1", [
    payment.registration_id,
  ])
  const {
    rows: [event],
  } = await query("select * from app_public.events where id = $1", [
    registration?.event_id,
  ])
  const {
    rows: [quota],
  } = await query("select * from app_public.quotas where id = $1", [
    registration?.quota_id,
  ])
  const {
    rows: [registrationSecret],
  } = await query(
    "select update_token from app_private.registration_secrets where registration_id = $1",
    [payment.registration_id]
  )
  if (!registration || !event || !quota || !registrationSecret) {
    logger.error(
      `Registration, event, quota or secrets of payment ${paymentId} not found; aborting`
    )
    return
  }
  const { email, first_name, last_name } = registration
  if (!email) {
    logger.error("No email specified; aborting")
    return
  }

  const serviceFee = payment.method === "MANUAL" ? 0 : payment.service_fee_cents
  const sendEmailPayload: SendEmailPayload = {
    options: {
      to: email,
      subject: `${subjectEventName(event.name)} - Maksu vastaanotettu / Payment received`,
    },
    template: "payment_received.mjml.njk",
    variables: {
      url: ROOT_URL,
      eventName: event.name,
      registrationName: `${first_name} ${last_name}`,
      registrationQuota: quota.title,
      eventTime: getFormattedEventTime(event),
      eventSlug: event.slug,
      eventLocation: event.location,
      eventRegistrationUpdateLink: `update-registration/${registrationSecret.update_token}`,
      price: payment.ticket_amount_cents,
      serviceFee,
      total: payment.ticket_amount_cents + serviceFee,
      paidAt: formatDateTime(payment.paid_at ?? new Date()),
      paymentMethod: payment.method,
    },
  }
  await addJob("send_email", sendEmailPayload)
}

export default task
