/**
 * Stripe payments: the feature flag and the fee maths shared by the server,
 * the worker and the client. Money is always integer cents; only
 * `formatEuro` turns it into text.
 */

/**
 * Payments are on only when the flag is set and both Stripe secrets are
 * present; a partial configuration is a misconfiguration, not a
 * half-enabled feature. This is the single switch for the whole feature:
 * nothing else should read these env vars to decide whether payments exist.
 */
export function paymentsEnabled(): boolean {
  return !!(
    process.env.PAYMENTS_ENABLED === "1" &&
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET
  )
}

/**
 * Stripe's fixed per-payment fee, charged to the customer as a separate
 * "service fee" line item at Checkout. Never refunded.
 */
export const SERVICE_FEE_CENTS = 25

/** Stripe's percentage fee, taken from the total charge. */
export const STRIPE_PERCENT_FEE = 0.015

/**
 * The smallest non-zero ticket price. Together with the service fee it makes
 * the total charge reach Stripe's 0,50 € minimum.
 */
export const MIN_PAID_PRICE_CENTS = 25

// The percentage fee in per-mille, so the maths below stays in integers.
const STRIPE_PERCENT_FEE_PER_MILLE = Math.round(STRIPE_PERCENT_FEE * 1000)

function assertCents(cents: number, name: string): void {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError(
      `${name} must be a non-negative integer number of cents, got ${cents}`
    )
  }
}

/**
 * A ticket price is valid when it is free (0) or at least
 * `MIN_PAID_PRICE_CENTS`.
 */
export function isValidTicketPriceCents(priceCents: number): boolean {
  return (
    Number.isSafeInteger(priceCents) &&
    (priceCents === 0 || priceCents >= MIN_PAID_PRICE_CENTS)
  )
}

/**
 * What the customer pays at Checkout: the ticket price plus the service fee.
 * A free ticket is never charged, so it costs 0.
 */
export function totalChargeCents(priceCents: number): number {
  assertCents(priceCents, "priceCents")
  if (priceCents === 0) return 0
  return priceCents + SERVICE_FEE_CENTS
}

/**
 * What the guild receives for a ticket: Stripe keeps the service fee plus
 * 1,5 % of the total charge, so the guild gets
 * `P − 1,5 % × (P + 0,25 €)`, rounded to the nearest cent (halves up).
 * 0 for a free ticket.
 *
 * Computed as `(985·P − 375) / 1000` so the only floating point step is one
 * correctly rounded division: an exact half stays an exact half and rounds
 * up, instead of landing a hair either side of it.
 */
export function guildReceivesCents(priceCents: number): number {
  assertCents(priceCents, "priceCents")
  if (priceCents === 0) return 0
  const numerator =
    1000 * priceCents -
    STRIPE_PERCENT_FEE_PER_MILLE * (priceCents + SERVICE_FEE_CENTS)
  return Math.round(numerator / 1000)
}

/**
 * Formats cents as euros in the style of the designs, e.g. `18,00 €`.
 * Every language uses the Finnish decimal comma and a trailing euro sign;
 * thousands are grouped with a space (`1 234,50 €`). `lang` is accepted so
 * call sites need not change if a locale ever needs its own format.
 */
export function formatEuro(cents: number, _lang?: string): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`cents must be an integer, got ${cents}`)
  }
  const sign = cents < 0 ? "-" : ""
  const abs = Math.abs(cents)
  const euros = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  const rest = (abs % 100).toString().padStart(2, "0")
  return `${sign}${euros},${rest} €`
}
