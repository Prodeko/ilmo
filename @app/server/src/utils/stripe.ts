import { paymentsEnabled } from "@app/lib"
import Stripe from "stripe"

// Server code reads the flag through here alongside the client itself.
export { paymentsEnabled }

let client: Stripe | null = null

/**
 * The shared Stripe client, constructed on first use from
 * `STRIPE_SECRET_KEY`. The API version is the one this major of the `stripe`
 * package is pinned to, so upgrading the package is what moves it.
 *
 * Throws while payments are disabled: every caller sits behind a
 * `paymentsEnabled()` check, so reaching this with the flag off is a bug, and
 * failing loudly beats talking to Stripe with a half-configured server.
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
