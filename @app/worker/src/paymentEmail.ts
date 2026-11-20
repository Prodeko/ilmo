import dayjs from "dayjs"

import { isFeatureEnabled } from "./featureFlags"
import {
  loadRegistrationPaymentState,
  payLink,
  paymentApplies,
  ticketAmounts,
} from "./payments"

import type {
  RegistrationEmailContext,
  RegistrationEmailContribution,
} from "./registrationEmail"

/**
 * Registration email contributor: the payment block of the confirmation and
 * of the notice of a spot received from the queue, while `payments` is
 * enabled. Empty when no payment applies, so emails of events without
 * payments are unchanged. Amounts are cents.
 *
 * Confirmation: amounts, `isPaid` and `isQueued` (queued registrations get no
 * payment block), and `payLink` only when the registration can be paid now:
 * in DURING_REGISTRATION mode, or once signup has closed.
 *
 * Spot from the queue: amounts and `payLink`, only when the registration can
 * be paid now and is unpaid. Before the close in AFTER_REGISTRATION mode the
 * link comes with the close email instead.
 */
export async function paymentEmailContributor(
  ctx: RegistrationEmailContext
): Promise<RegistrationEmailContribution> {
  const { kind, query, event, registration, registrationSecret } = ctx
  if (!paymentApplies(event, registration)) {
    return {}
  }
  if (!(await isFeatureEnabled(query, "payments"))) {
    return {}
  }
  const state = await loadRegistrationPaymentState(query, registration.id)
  const paymentOpen =
    event.payment_mode === "DURING_REGISTRATION" || !!state?.signup_closed
  const unpaid = state?.payment_status === "UNPAID"
  const amounts = {
    ...ticketAmounts(registration.price_cents),
    paymentMode: event.payment_mode,
  }

  if (kind === "spotFromQueue") {
    if (!paymentOpen || !unpaid) {
      return {}
    }
    return {
      variables: {
        ...amounts,
        payLink: payLink(registrationSecret.update_token),
      },
    }
  }

  const isQueued = state?.queue_status === "IN_QUEUE"
  const isPaid =
    state?.payment_status === "PAID" ||
    state?.payment_status === "PAID_MANUALLY"
  const registrationEnd = dayjs(event.registration_end_time)
  return {
    variables: {
      ...amounts,
      isQueued,
      isPaid,
      ...(paymentOpen && !isQueued && unpaid
        ? { payLink: payLink(registrationSecret.update_token) }
        : {}),
      registrationEndDate: registrationEnd.format("D.M.YYYY"),
      registrationEndTime: registrationEnd.format("HH:mm"),
    },
  }
}
