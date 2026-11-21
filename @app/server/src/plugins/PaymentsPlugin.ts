import { SERVICE_FEE_CENTS, totalChargeCents } from "@app/lib"
import { gql, makeExtendSchemaPlugin } from "graphile-utils"
import { createHash } from "node:crypto"
import { Pool } from "pg"

import { createCheckoutSession } from "../payments/checkout"
import {
  checkoutBlockedReason,
  CheckoutFailedError,
  loadPaidPayment,
  loadRegistrationForPayment,
  normalizeLanguage,
  PaymentError,
  PaymentLookupFailedError,
} from "../payments/registrationPayment"
import { isFeatureEnabledForSession } from "../utils/featureFlags"
import { paymentsConfigured } from "../utils/stripe"

import {
  constructRateLimitKey,
  RateLimitException,
  rateLimitRequester,
} from "./RateLimitPlugin"

import type { OurGraphQLContext } from "../middleware/installPostGraphile"

/**
 * Checkout Sessions one requester (signed-in user, else IP address) may start
 * for one registration within CHECKOUT_RATE_LIMIT_MINUTES. Every attempt
 * counts, also failed ones, so that a script can't create Stripe sessions in
 * a loop. Keyed per registration so that participants behind one shared IP
 * address don't limit each other.
 */
export const CHECKOUT_RATE_LIMIT = 10
const CHECKOUT_RATE_LIMIT_MINUTES = 30

async function checkCheckoutRateLimit(
  context: OurGraphQLContext,
  updateToken: string
) {
  const { pgClient, ipAddress, redisClient } = context
  const requester = await rateLimitRequester(pgClient, ipAddress)
  // The update token is a secret: only a digest of it goes into Redis
  const registrationKey = createHash("sha256")
    .update(updateToken)
    .digest("hex")
    .slice(0, 32)
  const key = constructRateLimitKey(
    "createCheckoutSession",
    registrationKey,
    requester
  )
  const attempts = await redisClient.incr(key)
  if (attempts === 1) {
    await redisClient.expire(key, CHECKOUT_RATE_LIMIT_MINUTES * 60)
  }
  if (attempts > CHECKOUT_RATE_LIMIT) {
    throw new RateLimitException(
      `Too many requests. You have been rate-limited for ${CHECKOUT_RATE_LIMIT_MINUTES} minutes.`
    )
  }
}

/**
 * The RegistrationPayment of paymentByUpdateToken, or null. While payments
 * are off the page still shows a payment that exists, but Pay is blocked
 * with PAYMENTS_DISABLED.
 */
async function loadPaymentByUpdateToken(
  rootPgPool: Pool,
  updateToken: string,
  paymentsOn: boolean
) {
  const registration = await loadRegistrationForPayment(rootPgPool, updateToken)
  if (!registration || !registration.is_finished) {
    return null
  }
  const paid = await loadPaidPayment(rootPgPool, registration.id)
  const priceCents = registration.price_cents
  const required = registration.payment_status !== "NOT_REQUIRED"
  return {
    eventId: registration.event_id,
    eventSlug: registration.event_slug,
    eventName: registration.event_name,
    eventStartTime: registration.event_start_time.toISOString(),
    eventEndTime: registration.event_end_time.toISOString(),
    registrationEndTime: registration.registration_end_time.toISOString(),
    quotaTitle: registration.quota_title,
    firstName: registration.first_name,
    lastName: registration.last_name,
    queueStatus: registration.queue_status,
    queuePosition: registration.queue_position,
    status: registration.payment_status,
    priceCents: required ? priceCents : 0,
    serviceFeeCents: required ? SERVICE_FEE_CENTS : 0,
    totalCents: required ? totalChargeCents(priceCents) : 0,
    paidManually: paid?.method === "MANUAL",
    paidTotalCents: paid
      ? paid.ticket_amount_cents + paid.service_fee_cents
      : null,
    paidAt: paid?.paid_at?.toISOString() ?? null,
    blockedReason: paymentsOn
      ? checkoutBlockedReason(registration)
      : "PAYMENTS_DISABLED",
  }
}

const PaymentsPlugin = makeExtendSchemaPlugin(() => ({
  typeDefs: gql`
    """
    Why a registration can't be paid right now. The error code of
    createCheckoutSession, and blockedReason of paymentByUpdateToken.
    """
    enum PaymentErrorCode {
      "Payments are switched off, or Stripe is not configured on this server."
      PAYMENTS_DISABLED
      "No finished registration has this update token."
      REGISTRATION_NOT_FOUND
      "The quota is free, or the event has no payments."
      PAYMENT_NOT_REQUIRED
      "The registration has been paid (by card or marked paid by hand)."
      ALREADY_PAID
      "The registration is in the queue; it is paid once it gets a spot."
      IN_QUEUE
      "Payment opens when registration closes; registration is open (again)."
      PAYMENT_NOT_OPEN
    }

    type CreateCheckoutSessionPayload {
      "The Stripe Checkout page to redirect to."
      url: String!
    }

    """
    What the /pay page shows for a registration. Amounts are in cents.
    """
    type RegistrationPayment {
      eventId: UUID!
      eventSlug: String!
      eventName: JSON!
      eventStartTime: Datetime!
      eventEndTime: Datetime!
      registrationEndTime: Datetime!
      quotaTitle: JSON!
      firstName: String
      lastName: String
      "Queue status; null while the registration is not yet placed."
      queueStatus: RegistrationStatus
      queuePosition: Int
      status: RegistrationPaymentStatus!
      "The quota's current ticket price, which Pay charges. 0 when free."
      priceCents: Int!
      "The service fee charged on top of a paid ticket. 0 when free."
      serviceFeeCents: Int!
      totalCents: Int!
      "True when the paid payment was recorded by an organizer by hand."
      paidManually: Boolean!
      "What was paid, fee included (paid registrations only)."
      paidTotalCents: Int
      paidAt: Datetime
      "Why Pay is not available right now; null when it is."
      blockedReason: PaymentErrorCode
    }

    extend type Query {
      """
      The payment state of the registration with this update token, for the
      /pay page. Null when Stripe is not configured on this server or the
      token is unknown. Answers while the payments feature is off too, so
      that a payment already made stays visible; Pay is then blocked.
      """
      paymentByUpdateToken(updateToken: String!): RegistrationPayment
    }

    extend type Mutation {
      """
      Starts Stripe Checkout for the registration with this update token and
      returns the Checkout URL. Expires the registration's other open
      Checkout Sessions. Fails with a PaymentErrorCode as the error code when
      the registration can't be paid now. language (fi, en or se, default
      fi) sets the Checkout language and the /pay page Stripe returns to.
      """
      createCheckoutSession(
        updateToken: String!
        language: String
      ): CreateCheckoutSessionPayload
    }
  `,
  resolvers: {
    Query: {
      async paymentByUpdateToken(
        _query,
        args: { updateToken: string },
        context: OurGraphQLContext
      ) {
        if (!paymentsConfigured()) {
          return null
        }
        const { rootPgPool } = context
        try {
          const paymentsOn = await isFeatureEnabledForSession(
            "payments",
            context.pgClient
          )
          return await loadPaymentByUpdateToken(
            rootPgPool,
            args.updateToken,
            paymentsOn
          )
        } catch (e) {
          // Database errors can carry SQL details: log them, return a code
          context.logger.error(
            `paymentByUpdateToken failed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`
          )
          throw new PaymentLookupFailedError()
        }
      },
    },
    Mutation: {
      async createCheckoutSession(
        _mutation,
        args: { updateToken: string; language?: string | null },
        context: OurGraphQLContext
      ) {
        if (
          !paymentsConfigured() ||
          !(await isFeatureEnabledForSession("payments", context.pgClient))
        ) {
          throw new PaymentError("PAYMENTS_DISABLED")
        }
        await checkCheckoutRateLimit(context, args.updateToken)
        try {
          const url = await createCheckoutSession({
            rootPgPool: context.rootPgPool,
            updateToken: args.updateToken,
            language: normalizeLanguage(args.language),
            logger: context.logger,
          })
          return { url }
        } catch (e) {
          if (e instanceof PaymentError) {
            throw e
          }
          // Stripe and database errors can carry details (key prefixes,
          // SQL) that must not reach the caller: log them, return a code
          context.logger.error(
            `createCheckoutSession failed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`
          )
          throw new CheckoutFailedError()
        }
      },
    },
  },
}))

export default PaymentsPlugin
