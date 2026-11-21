import dayjs from "dayjs"

import { isFeatureEnabled } from "./featureFlags"
import {
  loadRegistrationPaymentState,
  payLink,
  ticketAmounts,
} from "./payments"

import type {
  RegistrationEmailContext,
  RegistrationEmailContribution,
} from "./registrationEmail"

/**
 * Registration email contributor: the payment block of the confirmation and
 * of the notice of a spot received from the queue, while `payments` is
 * enabled. Empty when the quota is free, so emails of free events are
 * unchanged. Amounts are cents, at the quota's current price.
 *
 * Payment opens when registration closes, so `payLink` is included only
 * once signup has closed and the registration is unpaid; before that the
 * link comes with the close email.
 *
 * Confirmation: amounts, `isQueued` (queued registrations get no payment
 * block) and the registration end, which the email names as when the link
 * arrives.
 *
 * Spot from the queue: amounts and `payLink`, only when the registration can
 * be paid now.
 */
export async function paymentEmailContributor(
  ctx: RegistrationEmailContext
): Promise<RegistrationEmailContribution> {
  const { kind, query, event, quota, registration, registrationSecret } = ctx
  const priceCents: number = quota.price_cents ?? 0
  if (priceCents <= 0) {
    return {}
  }
  if (!(await isFeatureEnabled(query, "payments"))) {
    return {}
  }
  const state = await loadRegistrationPaymentState(query, registration.id)
  const payable = !!state?.signup_closed && state.payment_status === "UNPAID"
  const amounts = ticketAmounts(priceCents)

  if (kind === "spotFromQueue") {
    if (!payable) {
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
  const registrationEnd = dayjs(event.registration_end_time)
  return {
    variables: {
      ...amounts,
      isQueued,
      ...(payable && !isQueued
        ? { payLink: payLink(registrationSecret.update_token) }
        : {}),
      registrationEndDate: registrationEnd.format("D.M.YYYY"),
      registrationEndTime: registrationEnd.format("HH:mm"),
    },
  }
}
