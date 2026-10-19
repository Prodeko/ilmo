import {
  formatEuro,
  paymentsEnabled,
  SERVICE_FEE_CENTS,
  totalChargeCents,
} from "@app/lib"
import dayjs from "dayjs"
import Stripe from "stripe"

import type { JobHelpers } from "graphile-worker"

/*
 * Shared helpers for the payment tasks. Money is integer cents everywhere
 * here; the templates format it with the `euro` filter (see send_email).
 */

export { formatEuro, paymentsEnabled }

let client: Stripe | null = null

/**
 * The worker's Stripe client, constructed on first use from
 * `STRIPE_SECRET_KEY` (the server has its own, in @app/server). Throws while
 * payments are disabled: tasks check `paymentsEnabled()` first.
 */
export function getStripe(): Stripe {
  if (!paymentsEnabled()) {
    throw new Error(
      "Stripe client requested while payments are disabled (PAYMENTS_ENABLED / STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET)"
    )
  }
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      appInfo: { name: "Ilmo", url: "https://github.com/Prodeko/ilmo" },
      maxNetworkRetries: 2,
    })
  }
  return client
}

/** Forget the cached client, so tests can change the environment. */
export function resetStripeClient(): void {
  client = null
}

export type PaymentMode = "NONE" | "DURING_REGISTRATION" | "AFTER_REGISTRATION"

export type TranslatedField = { fi?: string; en?: string }

/**
 * The payment link of a registration, relative to `${url}/${lang}/` like
 * `eventRegistrationUpdateLink`. It reuses the update token (PRD §6.7).
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

/**
 * Whether a registration of this event has to pay: payments are on, the event
 * collects payments and the registration's snapshot price is above 0.
 */
export function paymentApplies(
  event: { payment_mode?: PaymentMode } & Record<string, any>,
  registration: { price_cents?: number | null } & Record<string, any>
): boolean {
  return (
    paymentsEnabled() &&
    event.payment_mode !== "NONE" &&
    (registration.price_cents ?? 0) > 0
  )
}

export interface RegistrationPaymentState {
  /** IN_QUOTA, IN_OPEN_QUOTA or IN_QUEUE; null if the view has no row. */
  queue_status: "IN_QUOTA" | "IN_OPEN_QUOTA" | "IN_QUEUE" | null
  payment_status:
    | "NOT_REQUIRED"
    | "UNPAID"
    | "PAID"
    | "PAID_MANUALLY"
    | "REFUNDED"
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
  status: "PENDING" | "PAID" | "EXPIRED" | "REFUNDED"
  ticket_amount_cents: number
  service_fee_cents: number
  refunded_amount_cents: number
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  stripe_refund_id: string | null
  paid_at: Date | null
  refunded_at: Date | null
}
