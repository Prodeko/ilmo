import { Pool, PoolClient } from "pg"

/**
 * Why a registration can't be paid right now. Returned as the error `code`
 * of `createCheckoutSession` and as `blockedReason` of
 * `paymentByUpdateToken`, so the /pay page can map both to its states
 * (board 5). Also declared as the `PaymentErrorCode` GraphQL enum.
 */
export const PAYMENT_ERROR_CODES = [
  "PAYMENTS_DISABLED",
  "REGISTRATION_NOT_FOUND",
  "PAYMENT_NOT_REQUIRED",
  "ALREADY_PAID",
  "PAYMENT_REFUNDED",
  "IN_QUEUE",
  "PAYMENT_NOT_OPEN",
] as const

export type PaymentErrorCode = (typeof PAYMENT_ERROR_CODES)[number]

const PAYMENT_ERROR_MESSAGES: Record<PaymentErrorCode, string> = {
  PAYMENTS_DISABLED: "Payments are not available.",
  REGISTRATION_NOT_FOUND: "Registration matching token was not found.",
  PAYMENT_NOT_REQUIRED: "This registration does not require payment.",
  ALREADY_PAID: "This registration has already been paid.",
  PAYMENT_REFUNDED: "The payment for this registration has been refunded.",
  IN_QUEUE: "Registrations in the queue are not paid until they get a spot.",
  PAYMENT_NOT_OPEN: "Payment opens when registration closes.",
}

/**
 * An error with a `PaymentErrorCode`. `handleErrors` exposes `code` as
 * `extensions.exception.code`, like the database's own error codes.
 */
export class PaymentError extends Error {
  code: PaymentErrorCode

  constructor(code: PaymentErrorCode) {
    super(PAYMENT_ERROR_MESSAGES[code])
    this.name = "PaymentError"
    this.code = code
  }
}

export type PaymentMode = "NONE" | "DURING_REGISTRATION" | "AFTER_REGISTRATION"

export type RegistrationPaymentStatus =
  | "NOT_REQUIRED"
  | "UNPAID"
  | "PAID"
  | "PAID_MANUALLY"
  | "REFUNDED"

export type TranslatedField = Record<string, string | undefined>

/** A registration with everything needed to pay for it, by update token. */
export interface RegistrationForPayment {
  id: string
  event_id: string
  quota_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  price_cents: number | null
  is_finished: boolean
  event_name: TranslatedField
  event_slug: string
  event_start_time: Date
  event_end_time: Date
  registration_end_time: Date
  payment_mode: PaymentMode
  quota_title: TranslatedField
  queue_status: "IN_QUOTA" | "IN_OPEN_QUOTA" | "IN_QUEUE" | null
  queue_position: number | null
  payment_status: RegistrationPaymentStatus
  signup_closed: boolean
}

/**
 * Looks a registration up by its update token, which already grants
 * edit/delete rights over it, so it is also what the payment link uses.
 * Runs on the root pool: registration secrets are private. With `lock`, the
 * registration row is locked for update, which serializes Checkout creation
 * (and deletion, and webhook handling) per registration.
 */
export async function loadRegistrationForPayment(
  client: Pool | PoolClient,
  updateToken: string,
  { lock = false }: { lock?: boolean } = {}
): Promise<RegistrationForPayment | null> {
  const {
    rows: [registration],
  } = await client.query<RegistrationForPayment>(
    `select
        r.id,
        r.event_id,
        r.quota_id,
        r.first_name,
        r.last_name,
        r.email,
        r.price_cents,
        r.is_finished,
        e.name as event_name,
        e.slug as event_slug,
        e.event_start_time,
        e.event_end_time,
        e.registration_end_time,
        e.payment_mode,
        q.title as quota_title,
        s.status as queue_status,
        s.position as queue_position,
        app_private.registration_payment_status(r) as payment_status,
        now() > e.registration_end_time as signup_closed
      from app_private.registration_secrets as rs
      join app_public.registrations as r on r.id = rs.registration_id
      join app_public.events as e on e.id = r.event_id
      join app_public.quotas as q on q.id = r.quota_id
      left join app_hidden.registrations_status_and_position as s on s.id = r.id
      where rs.update_token = $1
      ${lock ? "for update of r" : ""}`,
    [updateToken]
  )
  return registration ?? null
}

/**
 * Why Checkout can't start for this registration right now, or null when it
 * can. The order matters: it is the order the /pay page shows states in.
 */
export function checkoutBlockedReason(
  registration: RegistrationForPayment | null
): PaymentErrorCode | null {
  if (!registration || !registration.is_finished) {
    return "REGISTRATION_NOT_FOUND"
  }
  switch (registration.payment_status) {
    case "NOT_REQUIRED":
      return "PAYMENT_NOT_REQUIRED"
    case "PAID":
    case "PAID_MANUALLY":
      return "ALREADY_PAID"
    case "REFUNDED":
      return "PAYMENT_REFUNDED"
  }
  // Queued registrations never pay; they get the link when they get a spot
  if (
    registration.queue_status !== "IN_QUOTA" &&
    registration.queue_status !== "IN_OPEN_QUOTA"
  ) {
    return "IN_QUEUE"
  }
  if (
    registration.payment_mode === "AFTER_REGISTRATION" &&
    !registration.signup_closed
  ) {
    return "PAYMENT_NOT_OPEN"
  }
  return null
}

/** The paid (or else refunded) payment of a registration, for the /pay page. */
export interface SettledPayment {
  method: "STRIPE" | "MANUAL"
  status: "PAID" | "REFUNDED"
  ticket_amount_cents: number
  service_fee_cents: number
  refunded_amount_cents: number
  paid_at: Date | null
  refunded_at: Date | null
}

export async function loadSettledPayment(
  client: Pool | PoolClient,
  registrationId: string
): Promise<SettledPayment | null> {
  const {
    rows: [payment],
  } = await client.query<SettledPayment>(
    `select method, status, ticket_amount_cents, service_fee_cents,
        refunded_amount_cents, paid_at, refunded_at
      from app_public.payments
      where registration_id = $1 and status in ('PAID', 'REFUNDED')
      order by status = 'PAID' desc, coalesce(refunded_at, paid_at, created_at) desc
      limit 1`,
    [registrationId]
  )
  return payment ?? null
}

/** Languages of the client, as in @app/client/i18n.js. */
export const LANGUAGES = ["fi", "en", "se"] as const
export type Language = (typeof LANGUAGES)[number]

export function normalizeLanguage(
  language: string | null | undefined
): Language {
  return (LANGUAGES as readonly string[]).includes(language ?? "")
    ? (language as Language)
    : "fi"
}

/**
 * Translated fields are stored in Finnish and English only; Swedish pages
 * show English.
 */
export function translate(field: TranslatedField, language: Language): string {
  const key = language === "fi" ? "fi" : "en"
  return field?.[key] || field?.fi || field?.en || ""
}
