import {
  loadRegistrationPaymentState,
  payLink,
  paymentApplies,
  paymentsEnabled,
  subjectEventName,
  ticketAmounts,
} from "../payments"

import type { SendEmailPayload } from "./send_email"
import type { Task } from "graphile-worker"

export interface PaymentReminderPayload {
  registrationId: string
  /** Sent by the close-of-registration job: says registration has closed. */
  closed?: boolean
}

const { ROOT_URL } = process.env

/**
 * Payment reminder (board 13), queued by the organizers' bulk reminder
 * (admin_send_payment_reminders) and by event__send_unpaid_on_close. Checks
 * again when it runs, so a registration paid, refunded, moved or deleted in
 * the meantime gets nothing.
 */
const task: Task = async (inPayload, { addJob, query, logger }) => {
  const { registrationId, closed = false } = inPayload as PaymentReminderPayload

  if (!paymentsEnabled()) {
    logger.info(
      `Payments are disabled; not sending a payment reminder to registration ${registrationId}`
    )
    return
  }

  const {
    rows: [registration],
  } = await query("select * from app_public.registrations where id = $1", [
    registrationId,
  ])
  if (!registration || !registration.is_finished) {
    logger.info(`Registration ${registrationId} not found; not reminding`)
    return
  }
  const {
    rows: [event],
  } = await query("select * from app_public.events where id = $1", [
    registration.event_id,
  ])
  const {
    rows: [quota],
  } = await query("select * from app_public.quotas where id = $1", [
    registration.quota_id,
  ])
  const {
    rows: [registrationSecret],
  } = await query(
    "select update_token from app_private.registration_secrets where registration_id = $1",
    [registrationId]
  )
  if (!event || !quota || !registrationSecret) {
    logger.error(
      `Event, quota or secrets of registration ${registrationId} not found; aborting`
    )
    return
  }
  if (!paymentApplies(event, registration)) {
    logger.info(
      `Registration ${registrationId} needs no payment; not reminding`
    )
    return
  }

  const state = await loadRegistrationPaymentState(query, registrationId)
  if (state?.payment_status !== "UNPAID") {
    logger.info(
      `Registration ${registrationId} is ${state?.payment_status}; not reminding`
    )
    return
  }
  if (
    state.queue_status !== "IN_QUOTA" &&
    state.queue_status !== "IN_OPEN_QUOTA"
  ) {
    logger.info(`Registration ${registrationId} is queued; not reminding`)
    return
  }

  const { email, first_name } = registration
  if (!email) {
    logger.error("No email specified; aborting")
    return
  }

  const sendEmailPayload: SendEmailPayload = {
    options: {
      to: email,
      subject: `${subjectEventName(event.name)} - Maksumuistutus / Payment reminder`,
    },
    template: "payment_reminder.mjml.njk",
    variables: {
      url: ROOT_URL,
      eventName: event.name,
      firstName: first_name,
      registrationQuota: quota.title,
      ...ticketAmounts(registration.price_cents),
      payLink: payLink(registrationSecret.update_token),
      closed,
    },
  }
  await addJob("send_email", sendEmailPayload)
}

export default task
