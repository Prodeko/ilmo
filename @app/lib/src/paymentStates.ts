/**
 * Participant-facing payment states: whether the registration form shows
 * the payment notice and which state the /pay page shows. Pure functions so
 * the UI decisions are unit tested; amounts are integer cents.
 */
type PaymentStatus = "NOT_REQUIRED" | "UNPAID" | "PAID" | "PAID_MANUALLY"

/**
 * True when registering in this quota costs money: payments are on and the
 * ticket is not free. The registration form then says that the payment link
 * comes by email when registration closes.
 */
export function quotaRequiresPayment(
  paymentsEnabled: boolean | null | undefined,
  priceCents: number | null | undefined
): boolean {
  return !!paymentsEnabled && (priceCents ?? 0) > 0
}

export type PayPageState =
  | "disabled"
  | "notFound"
  | "unpaid"
  | "confirming"
  | "paid"
  | "paidManually"
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
 * until `confirmTimedOut`. A payment that exists is shown while payments are
 * switched off; only Pay is replaced by "disabled" (blockedReason
 * PAYMENTS_DISABLED).
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
    case "NOT_REQUIRED":
      return "free"
  }
  if (payment.blockedReason === "PAYMENTS_DISABLED") return "disabled"
  if (payment.blockedReason === "IN_QUEUE") return "queued"
  if (payment.blockedReason === "PAYMENT_NOT_OPEN") return "opensLater"
  if (returnStatus === "success" && !confirmTimedOut) return "confirming"
  return "unpaid"
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
