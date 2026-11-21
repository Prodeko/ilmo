import { SERVICE_FEE_CENTS, totalChargeCents } from "@app/lib"
import dayjs from "dayjs"

import type { JobHelpers } from "graphile-worker"

/*
 * Shared helpers for the payment tasks. Money is integer cents everywhere
 * here; the templates format it with the `euro` filter (see send_email).
 *
 * Whether payments are on is the `payments` feature flag: tasks that start
 * something new (reminders, the close email) run under `withFeature`, the
 * registration email block checks it itself. The emails about payments
 * already made are never gated. The worker never calls Stripe.
 */

export type TranslatedField = { fi?: string; en?: string }

/**
 * The payment link of a registration, relative to `${url}/${lang}/` like
 * `eventRegistrationUpdateLink`. It reuses the update token, so whoever can
 * edit the registration can also pay for it.
 */
export function payLink(updateToken: string): string {
  return `pay/${updateToken}`
}

/**
 * The amounts of a ticket, for the payment blocks of the emails: ticket
 * price, service fee and total, in cents.
 */
export function ticketAmounts(priceCents: number) {
  return {
    price: priceCents,
    serviceFee: SERVICE_FEE_CENTS,
    total: totalChargeCents(priceCents),
  }
}

/** Email subjects use the Finnish event name, or else the English one. */
export function subjectEventName(name: TranslatedField | null): string {
  return name?.fi || name?.en || ""
}

/** A date and time as in the designs, e.g. `17.10.2026 14:32`. */
export function formatDateTime(date: Date | string): string {
  return dayjs(date).format("D.M.YYYY HH:mm")
}

export interface RegistrationPaymentState {
  /** IN_QUOTA, IN_OPEN_QUOTA or IN_QUEUE; null if the view has no row. */
  queue_status: "IN_QUOTA" | "IN_OPEN_QUOTA" | "IN_QUEUE" | null
  payment_status: "NOT_REQUIRED" | "UNPAID" | "PAID" | "PAID_MANUALLY"
  signup_closed: boolean
}

/** Queue status, payment status and whether signup has closed. */
export async function loadRegistrationPaymentState(
  query: JobHelpers["query"],
  registrationId: string
): Promise<RegistrationPaymentState | null> {
  const {
    rows: [state],
  } = await query<RegistrationPaymentState & Record<string, unknown>>(
    `select
        s.status as queue_status,
        app_private.registration_payment_status(r) as payment_status,
        now() > e.registration_end_time as signup_closed
      from app_public.registrations as r
      join app_public.events as e on e.id = r.event_id
      left join app_hidden.registrations_status_and_position as s on s.id = r.id
      where r.id = $1`,
    [registrationId]
  )
  return state ?? null
}

export interface PaymentRow {
  id: string
  registration_id: string | null
  event_id: string | null
  quota_id: string | null
  event_name: TranslatedField
  quota_title: TranslatedField
  method: "STRIPE" | "MANUAL"
  status: "PENDING" | "PAID" | "EXPIRED"
  ticket_amount_cents: number
  service_fee_cents: number
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  paid_at: Date | null
}
