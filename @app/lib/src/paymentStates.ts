/**
 * Participant-facing payment states: which variant of the registration form,
 * the /pay page and the cancel dialog to show. Pure functions so the UI
 * decisions are unit tested; amounts are integer cents.
 */
type PaymentMode = "NONE" | "DURING_REGISTRATION" | "AFTER_REGISTRATION"

type PaymentStatus =
  | "NOT_REQUIRED"
  | "UNPAID"
  | "PAID"
  | "PAID_MANUALLY"
  | "REFUNDED"

/**
 * True when the event charges for this quota: payments are on, the event has
 * a payment mode and the ticket is not free.
 */
export function quotaRequiresPayment(
  paymentsEnabled: boolean | null | undefined,
  paymentMode: PaymentMode | null | undefined,
  priceCents: number | null | undefined
): boolean {
  return (
    !!paymentsEnabled &&
    !!paymentMode &&
    paymentMode !== "NONE" &&
    (priceCents ?? 0) > 0
  )
}

export type RegistrationFormPaymentVariant = "during" | "after" | "queued"

/**
 * The payment block of the registration form (board 2), or null when the
 * form looks exactly as it does without payments.
 */
export function registrationFormPaymentVariant(
  paymentsEnabled: boolean | null | undefined,
  paymentMode: PaymentMode | null | undefined,
  priceCents: number | null | undefined,
  isQueued: boolean
): RegistrationFormPaymentVariant | null {
  if (!quotaRequiresPayment(paymentsEnabled, paymentMode, priceCents)) {
    return null
  }
  if (isQueued) return "queued"
  return paymentMode === "DURING_REGISTRATION" ? "during" : "after"
}

export type PayPageState =
  | "disabled"
  | "notFound"
  | "unpaid"
  | "confirming"
  | "paid"
  | "paidManually"
  | "refunded"
  | "queued"
  | "opensLater"
  | "free"

export interface PayPagePayment {
  status: PaymentStatus
  paidManually: boolean
  blockedReason?: string | null
}

/**
 * The state the /pay page shows (boards 4 and 5). `returnStatus` is the
 * `status` query parameter Stripe redirects back with; after `success` the
 * page shows "confirming" until the webhook has marked the payment paid, or
 * until `confirmTimedOut`.
 */
export function payPageState(
  paymentsEnabled: boolean | null | undefined,
  payment: PayPagePayment | null | undefined,
  {
    returnStatus,
    confirmTimedOut = false,
  }: { returnStatus?: string | null; confirmTimedOut?: boolean } = {}
): PayPageState {
  if (!paymentsEnabled) return "disabled"
  if (!payment) return "notFound"
  switch (payment.status) {
    case "PAID_MANUALLY":
      return "paidManually"
    case "PAID":
      return payment.paidManually ? "paidManually" : "paid"
    case "REFUNDED":
      return "refunded"
    case "NOT_REQUIRED":
      return "free"
  }
  if (payment.blockedReason === "IN_QUEUE") return "queued"
  if (payment.blockedReason === "PAYMENT_NOT_OPEN") return "opensLater"
  if (returnStatus === "success" && !confirmTimedOut) return "confirming"
  return "unpaid"
}

export interface CancelRefund {
  paidCents: number
  serviceFeeCents: number
  refundCents: number
}

/**
 * What a participant gets back when they cancel (board 6): the stored ticket
 * amount of a card payment, which is what the refund job refunds; the
 * service fee is the rest of what was paid. Null when nothing is refunded
 * automatically (unpaid, free, refunded already, or paid by hand).
 */
export function cancelRefund(
  payment:
    | {
        status: PaymentStatus
        paidManually: boolean
        paidTotalCents?: number | null
        paidTicketCents?: number | null
      }
    | null
    | undefined
): CancelRefund | null {
  if (
    !payment ||
    payment.status !== "PAID" ||
    payment.paidManually ||
    payment.paidTotalCents == null ||
    payment.paidTicketCents == null
  ) {
    return null
  }
  const paidCents = payment.paidTotalCents
  const refundCents = Math.min(payment.paidTicketCents, paidCents)
  return {
    paidCents,
    serviceFeeCents: paidCents - refundCents,
    refundCents,
  }
}

const STRIPE_CHECKOUT_ORIGIN = "https://checkout.stripe.com"

/**
 * True for a Stripe Checkout page URL. The client only redirects to URLs
 * that pass this check, so a bad server response can't send people
 * elsewhere.
 */
export function isStripeCheckoutUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    return new URL(url).origin === STRIPE_CHECKOUT_ORIGIN
  } catch {
    return false
  }
}
