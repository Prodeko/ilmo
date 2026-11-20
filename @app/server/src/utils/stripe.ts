import { paymentsConfigured } from "@app/lib"
import Stripe from "stripe"

// Server code reads the configuration check through here.
export { paymentsConfigured }

let client: Stripe | null = null

/**
 * The shared Stripe client, constructed on first use from
 * `STRIPE_SECRET_KEY`. The API version is the one this major of the `stripe`
 * package is pinned to, so upgrading the package is what moves it.
 *
 * Throws while Stripe is not configured: every caller sits behind a
 * `paymentsConfigured()` check (and, for starting a payment, the `payments`
 * flag), so reaching this unconfigured is a bug, and failing loudly beats
 * talking to Stripe with a half-configured server.
 */
export function getStripe(): Stripe {
  if (!paymentsConfigured()) {
    throw new Error(
      "Stripe client requested while Stripe is not configured (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET)"
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
