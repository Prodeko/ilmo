import { SERVICE_FEE_CENTS } from "@app/lib"
import { Pool } from "pg"

import { getStripe, paymentsEnabled } from "../utils/stripe"

import {
  checkoutBlockedReason,
  Language,
  loadRegistrationForPayment,
  PaymentError,
  RegistrationForPayment,
  translate,
} from "./registrationPayment"
import { INSTANCE_METADATA_KEY } from "./webhook"

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
 * opening a second one (its row stays PENDING for the webhook).
 *
 * Runs outside any transaction. Rows are marked EXPIRED only while still
 * PENDING, so a webhook that marked one PAID meanwhile wins. A pending row
 * without a session id belongs to a concurrent or crashed checkout; expiring
 * it makes a concurrent one give up its session (see createCheckoutSession).
 */
async function expirePendingSessions(
  rootPgPool: Pool,
  stripe: Stripe,
  pending: PendingPayment[]
) {
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
    await rootPgPool.query(
      `update app_public.payments set status = 'EXPIRED'
        where id = $1 and status = 'PENDING'`,
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
    [INSTANCE_METADATA_KEY]: ROOT_URL ?? "",
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
 * No transaction or row lock is held while Stripe is called, so slow Stripe
 * calls can't tie up database connections:
 * 1. In a short transaction holding the registration's row lock: check that
 *    it can be paid, list its pending payments and insert a new PENDING
 *    payment row (its id goes into the session metadata).
 * 2. Expire the older pending sessions, then create the session.
 * 3. Store the session id on the row, but only while it is still PENDING. A
 *    second click meanwhile has expired it; then this session is expired
 *    again and the call fails, and the newer click's session is the one to
 *    pay.
 * If anything fails, the new session is expired and the new row removed, so
 * nobody can pay into a payment Ilmo doesn't know.
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

  const { registration, paymentId, pending } = await reservePayment(
    rootPgPool,
    updateToken
  )

  let session: Stripe.Checkout.Session | null = null
  try {
    await expirePendingSessions(rootPgPool, stripe, pending)

    session = await stripe.checkout.sessions.create(
      checkoutSessionParams({
        registration,
        paymentId,
        updateToken,
        language,
      }),
      { idempotencyKey: `checkout-session-${paymentId}` }
    )
    if (!session.url) {
      throw new Error(`Checkout Session ${session.id} has no URL`)
    }

    const { rowCount } = await rootPgPool.query(
      `update app_public.payments set stripe_checkout_session_id = $2
        where id = $1 and status = 'PENDING'`,
      [paymentId, session.id]
    )
    if (!rowCount) {
      throw new Error(
        `Payment ${paymentId} was superseded by a newer checkout before its session was stored`
      )
    }
    return session.url
  } catch (e) {
    if (session) {
      const sessionId = session.id
      await stripe.checkout.sessions.expire(sessionId).catch((expireError) => {
        logger.error(
          `Could not expire Checkout Session ${sessionId} after a failed checkout: ${expireError}`
        )
      })
    }
    await rootPgPool
      .query(
        `delete from app_public.payments
          where id = $1 and status in ('PENDING', 'EXPIRED')`,
        [paymentId]
      )
      .catch((deleteError) => {
        logger.error(
          `Could not remove payment ${paymentId} after a failed checkout: ${deleteError}`
        )
      })
    throw e
  }
}

/**
 * Step 1 of createCheckoutSession: one short transaction holding the
 * registration's row lock (the same lock order as the webhook and deletion).
 */
async function reservePayment(
  rootPgPool: Pool,
  updateToken: string
): Promise<{
  registration: RegistrationForPayment
  paymentId: string
  pending: PendingPayment[]
}> {
  const client = await rootPgPool.connect()
  try {
    await client.query("begin")

    const registration = await loadRegistrationForPayment(client, updateToken, {
      lock: true,
    })
    const blockedReason = checkoutBlockedReason(registration)
    if (blockedReason) {
      throw new PaymentError(blockedReason)
    }

    const { rows: pending } = await client.query<PendingPayment>(
      `select id, stripe_checkout_session_id
        from app_public.payments
        where registration_id = $1 and method = 'STRIPE' and status = 'PENDING'
        order by created_at`,
      [registration!.id]
    )

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
    await client.query("commit")
    return { registration: registration!, paymentId: payment.id, pending }
  } catch (e) {
    await client.query("rollback").catch(() => {})
    throw e
  } finally {
    client.release()
  }
}
