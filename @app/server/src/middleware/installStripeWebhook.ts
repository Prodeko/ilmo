import { FastifyPluginAsync } from "fastify"

import { handleStripeEvent } from "../payments/webhook"
import { getStripe } from "../utils/stripe"

import type Stripe from "stripe"

export const STRIPE_WEBHOOK_PATH = "/api/stripe/webhook"

/**
 * POST /api/stripe/webhook, registered only while payments are enabled.
 *
 * Deliberately not wrapped in fastify-plugin: the raw-body content type
 * parsers below must stay inside this plugin's encapsulation context, or
 * they would replace JSON parsing for /graphql too. Stripe signs the exact
 * bytes it sends, so the body reaches `constructEvent` as a Buffer.
 *
 * The Stripe signature is the authentication, so the route is exempt from
 * CSRF protection (see installCSRFProtection.ts) and needs no session.
 *
 * Responses: 400 for a missing or bad signature, 500 when the database
 * fails (Stripe retries), and 200 for every verified event, including ones
 * that were already handled or that Ilmo ignores.
 */
const StripeWebhook: FastifyPluginAsync = async (app) => {
  app.removeAllContentTypeParsers()
  app.addContentTypeParser(
    "*",
    { parseAs: "buffer" },
    (_request, body, done) => {
      done(null, body)
    }
  )

  app.post(STRIPE_WEBHOOK_PATH, async (request, reply) => {
    const signature = request.headers["stripe-signature"]
    if (typeof signature !== "string" || !Buffer.isBuffer(request.body)) {
      return reply.code(400).send({ error: "Missing Stripe signature" })
    }

    let event: Stripe.Event
    try {
      event = getStripe().webhooks.constructEvent(
        request.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      )
    } catch (e) {
      request.log.warn(`Rejected Stripe webhook: ${e}`)
      return reply.code(400).send({ error: "Invalid Stripe signature" })
    }

    const client = await app.rootPgPool.connect()
    try {
      await client.query("begin")
      const outcome = await handleStripeEvent(client, event, request.log)
      await client.query("commit")
      request.log.info(`Stripe event ${event.id} (${event.type}): ${outcome}`)
      return reply.code(200).send({ received: true })
    } catch (e) {
      await client.query("rollback").catch(() => {})
      request.log.error(
        `Failed to handle Stripe event ${event.id} (${event.type}): ${e}`
      )
      return reply.code(500).send({ error: "Webhook handling failed" })
    } finally {
      client.release()
    }
  })
}

export default StripeWebhook
