import { SERVICE_FEE_CENTS } from "@app/lib"
import { Pool, PoolClient } from "pg"

import { getStripe, paymentsEnabled } from "../utils/stripe"

import {
  checkoutBlockedReason,
  Language,
  loadRegistrationForPayment,
  PaymentError,
  RegistrationForPayment,
  translate,
} from "./registrationPayment"

import type Stripe from "stripe"

/** Console or a request logger. */
type Logger = {
  error(message: string): void
}

/** Stripe Checkout locales for the client's languages. */
const STRIPE_LOCALES: Record<
  Language,
  Stripe.Checkout.SessionCreateParams.Locale
> = {
  fi: "fi",
  en: "en",
  se: "sv",
}

/** The second line item, the same in every language. */
export const SERVICE_FEE_LINE_ITEM_NAME = "Service fee / Palvelumaksu"

interface PendingPayment {
  id: string
  stripe_checkout_session_id: string | null
}

/**
 * Expires the registration's other open Checkout Sessions so that only the
 * newest one can be paid (PRD §6.7). A session that was completed meanwhile
 * means the payment is being confirmed by the webhook: refuse instead of
 * opening a second one.
 */
async function expirePendingSessions(
  client: PoolClient,
  stripe: Stripe,
  registrationId: string
) {
  const { rows: pending } = await client.query<PendingPayment>(
    `select id, stripe_checkout_session_id
      from app_public.payments
      where registration_id = $1 and method = 'STRIPE' and status = 'PENDING'
      for update`,
    [registrationId]
  )
  for (const payment of pending) {
    const sessionId = payment.stripe_checkout_session_id
    if (sessionId) {
      try {
        await stripe.checkout.sessions.expire(sessionId)
      } catch (e) {
        // Only open sessions can be expired; find out what happened to it
        const session = await stripe.checkout.sessions.retrieve(sessionId)
        if (session.status === "complete") {
          throw new PaymentError("ALREADY_PAID")
        }
        if (session.status !== "expired") {
          throw e
        }
      }
    }
    await client.query(
      `update app_public.payments set status = 'EXPIRED' where id = $1`,
      [payment.id]
    )
  }
}

/**
 * The parameters of the Checkout Session for a registration. Card payments
 * only: Apple Pay and Google Pay come with cards, and nothing else enabled in
 * the Stripe dashboard (MobilePay) is offered.
 */
export function checkoutSessionParams({
  registration,
  paymentId,
  updateToken,
  language,
}: {
  registration: RegistrationForPayment
  paymentId: string
  updateToken: string
  language: Language
}): Stripe.Checkout.SessionCreateParams {
  const { ROOT_URL } = process.env
  const payUrl = `${ROOT_URL}/${language}/pay/${encodeURIComponent(updateToken)}`
  const metadata = {
    registration_id: registration.id,
    event_id: registration.event_id,
    quota_id: registration.quota_id,
    payment_id: paymentId,
    event_slug: registration.event_slug,
  }
  return {
    mode: "payment",
    allowed_payment_method_types: ["card"],
    customer_email: registration.email ?? undefined,
    client_reference_id: registration.id,
    locale: STRIPE_LOCALES[language],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: registration.price_cents!,
          product_data: {
            name: `${translate(registration.event_name, language)} – ${translate(
              registration.quota_title,
              language
            )}`,
          },
        },
      },
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: SERVICE_FEE_CENTS,
          product_data: { name: SERVICE_FEE_LINE_ITEM_NAME },
        },
      },
    ],
    metadata,
    payment_intent_data: { metadata },
    success_url: `${payUrl}?status=success`,
    cancel_url: `${payUrl}?status=cancelled`,
  }
}

/**
 * Starts Stripe Checkout for the registration behind `updateToken` and
 * returns the URL to redirect to.
 *
 * Everything happens in one transaction holding the registration's row lock,
 * so two clicks on Pay can't open two sessions: older pending sessions are
 * expired, a PENDING payment row is inserted, the session is created (with
 * the payment id in its metadata) and its id stored on the row. If anything
 * fails after Stripe created the session, the session is expired again so
 * nobody can pay into a payment row that was rolled back.
 */
export async function createCheckoutSession({
  rootPgPool,
  updateToken,
  language,
  logger = console,
}: {
  rootPgPool: Pool
  updateToken: string
  language: Language
  logger?: Logger
}): Promise<string> {
  if (!paymentsEnabled()) {
    throw new PaymentError("PAYMENTS_DISABLED")
  }
  const stripe = getStripe()
  const client = await rootPgPool.connect()
  let session: Stripe.Checkout.Session | null = null
  try {
    await client.query("begin")

    const registration = await loadRegistrationForPayment(client, updateToken, {
      lock: true,
    })
    const blockedReason = checkoutBlockedReason(registration)
    if (blockedReason) {
      throw new PaymentError(blockedReason)
    }

    await expirePendingSessions(client, stripe, registration!.id)

    const {
      rows: [payment],
    } = await client.query<{ id: string }>(
      `insert into app_public.payments(
          registration_id, event_id, quota_id, event_name, quota_title,
          method, status, ticket_amount_cents, service_fee_cents, currency
        )
        select r.id, r.event_id, r.quota_id, e.name, q.title,
          'STRIPE', 'PENDING', r.price_cents, $2, 'eur'
        from app_public.registrations as r
        join app_public.events as e on e.id = r.event_id
        join app_public.quotas as q on q.id = r.quota_id
        where r.id = $1
        returning id`,
      [registration!.id, SERVICE_FEE_CENTS]
    )

    session = await stripe.checkout.sessions.create(
      checkoutSessionParams({
        registration: registration!,
        paymentId: payment.id,
        updateToken,
        language,
      }),
      { idempotencyKey: `checkout-session-${payment.id}` }
    )
    if (!session.url) {
      throw new Error(`Checkout Session ${session.id} has no URL`)
    }

    await client.query(
      `update app_public.payments set stripe_checkout_session_id = $2 where id = $1`,
      [payment.id, session.id]
    )
    await client.query("commit")
    return session.url
  } catch (e) {
    await client.query("rollback").catch(() => {})
    if (session) {
      const sessionId = session.id
      await stripe.checkout.sessions.expire(sessionId).catch((expireError) => {
        logger.error(
          `Could not expire Checkout Session ${sessionId} after a failed checkout: ${expireError}`
        )
      })
    }
    throw e
  } finally {
    client.release()
  }
}
