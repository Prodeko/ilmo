import { SERVICE_FEE_CENTS, totalChargeCents } from "@app/lib"
import { gql, makeExtendSchemaPlugin } from "graphile-utils"

import { createCheckoutSession } from "../payments/checkout"
import {
  checkoutBlockedReason,
  loadRegistrationForPayment,
  loadSettledPayment,
  normalizeLanguage,
  PaymentError,
} from "../payments/registrationPayment"
import { paymentsEnabled } from "../utils/stripe"

import type { OurGraphQLContext } from "../middleware/installPostGraphile"

const PaymentsPlugin = makeExtendSchemaPlugin(() => ({
  typeDefs: gql`
    """
    Why a registration can't be paid right now. The error code of
    createCheckoutSession, and blockedReason of paymentByUpdateToken.
    """
    enum PaymentErrorCode {
      "Stripe payments are not configured on this server."
      PAYMENTS_DISABLED
      "No finished registration has this update token."
      REGISTRATION_NOT_FOUND
      "The quota is free, or the event has no payments."
      PAYMENT_NOT_REQUIRED
      "The registration has been paid (by card or marked paid by hand)."
      ALREADY_PAID
      "The registration's payment has been refunded."
      PAYMENT_REFUNDED
      "The registration is in the queue; it is paid once it gets a spot."
      IN_QUEUE
      "The event collects payment after registration closes, which it has not yet."
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
      paymentMode: PaymentMode!
      quotaTitle: JSON!
      firstName: String
      lastName: String
      "Queue status; null while the registration is not yet placed."
      queueStatus: RegistrationStatus
      queuePosition: Int
      status: RegistrationPaymentStatus!
      "The ticket price the registration was made at. 0 when free."
      priceCents: Int!
      "The service fee charged on top of a paid ticket. 0 when free."
      serviceFeeCents: Int!
      totalCents: Int!
      "True when the paid payment was recorded by an organizer by hand."
      paidManually: Boolean!
      "What was paid, fee included (paid or refunded payments only)."
      paidTotalCents: Int
      paidAt: Datetime
      refundedAmountCents: Int
      refundedAt: Datetime
      "Why Pay is not available right now; null when it is."
      blockedReason: PaymentErrorCode
    }

    extend type Query {
      """
      True when Stripe payments are configured on this server. While false,
      every event behaves as if its payment mode were NONE.
      """
      paymentsEnabled: Boolean!

      """
      The payment state of the registration with this update token, for the
      /pay page. Null when payments are disabled or the token is unknown.
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
      paymentsEnabled() {
        return paymentsEnabled()
      },
      async paymentByUpdateToken(
        _query,
        args: { updateToken: string },
        context: OurGraphQLContext
      ) {
        if (!paymentsEnabled()) {
          return null
        }
        const { rootPgPool } = context
        const registration = await loadRegistrationForPayment(
          rootPgPool,
          args.updateToken
        )
        if (!registration || !registration.is_finished) {
          return null
        }
        const settled = await loadSettledPayment(rootPgPool, registration.id)
        const priceCents = registration.price_cents ?? 0
        const required = registration.payment_status !== "NOT_REQUIRED"
        return {
          eventId: registration.event_id,
          eventSlug: registration.event_slug,
          eventName: registration.event_name,
          eventStartTime: registration.event_start_time.toISOString(),
          eventEndTime: registration.event_end_time.toISOString(),
          registrationEndTime: registration.registration_end_time.toISOString(),
          paymentMode: registration.payment_mode,
          quotaTitle: registration.quota_title,
          firstName: registration.first_name,
          lastName: registration.last_name,
          queueStatus: registration.queue_status,
          queuePosition: registration.queue_position,
          status: registration.payment_status,
          priceCents: required ? priceCents : 0,
          serviceFeeCents: required ? SERVICE_FEE_CENTS : 0,
          totalCents: required ? totalChargeCents(priceCents) : 0,
          paidManually: settled?.method === "MANUAL",
          paidTotalCents: settled
            ? settled.ticket_amount_cents + settled.service_fee_cents
            : null,
          paidAt: settled?.paid_at?.toISOString() ?? null,
          refundedAmountCents: settled ? settled.refunded_amount_cents : null,
          refundedAt: settled?.refunded_at?.toISOString() ?? null,
          blockedReason: checkoutBlockedReason(registration),
        }
      },
    },
    Mutation: {
      async createCheckoutSession(
        _mutation,
        args: { updateToken: string; language?: string | null },
        context: OurGraphQLContext
      ) {
        if (!paymentsEnabled()) {
          throw new PaymentError("PAYMENTS_DISABLED")
        }
        const url = await createCheckoutSession({
          rootPgPool: context.rootPgPool,
          updateToken: args.updateToken,
          language: normalizeLanguage(args.language),
          logger: context.logger,
        })
        return { url }
      },
    },
  },
}))

export default PaymentsPlugin
