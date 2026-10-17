import { Pool } from "pg"

import { getStripe, resetStripeClient } from "../src/utils/stripe"

import {
  createEventDataAndLogin,
  poolFromUrl,
  TEST_DATABASE_URL,
} from "./helpers"

/*
 * Shared setup for the payments tests. Test files mock the `stripe` package
 * with `mockStripeModule` (see below), so nothing here talks to Stripe.
 */

const PAYMENTS_ENV_KEYS = [
  "PAYMENTS_ENABLED",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const

export const STRIPE_WEBHOOK_SECRET = "whsec_test_secret"

/**
 * Turns payments on for the test file and restores the environment
 * afterwards (jest shares the process between test files).
 */
export function enablePaymentsForEachTest() {
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const key of PAYMENTS_ENV_KEYS) {
      saved[key] = process.env[key]
    }
    process.env.PAYMENTS_ENABLED = "1"
    process.env.STRIPE_SECRET_KEY = "sk_test_123"
    process.env.STRIPE_WEBHOOK_SECRET = STRIPE_WEBHOOK_SECRET
    resetStripeClient()
  })
  afterEach(() => {
    for (const key of PAYMENTS_ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    resetStripeClient()
  })
}

export function disablePayments() {
  delete process.env.PAYMENTS_ENABLED
  resetStripeClient()
}

export interface StripeMock {
  checkout: {
    sessions: {
      create: jest.Mock
      expire: jest.Mock
      retrieve: jest.Mock
    }
  }
  refunds: { create: jest.Mock }
  webhooks: {
    generateTestHeaderString(opts: { payload: string; secret: string }): string
  }
}

/** The fake client behind getStripe(); payments must be enabled. */
export function stripeMock(): StripeMock {
  return getStripe() as unknown as StripeMock
}

export type PaymentMode = "NONE" | "DURING_REGISTRATION" | "AFTER_REGISTRATION"

interface PaidEventOptions {
  paymentMode?: PaymentMode
  priceCents?: number
  quotaSize?: number
  registrationCount?: number
  /** Move registration end into the past (signup closed). */
  signupClosed?: boolean
}

/**
 * Commits an event with one quota and some registrations (with secrets), as
 * createEventDataAndLogin does, then makes it paid: sets the payment mode,
 * the quota price and the registrations' price snapshot. Registrations are
 * in creation order, so with `quotaSize` smaller than `registrationCount`
 * the last ones are queued.
 */
export async function createPaidEvent({
  paymentMode = "DURING_REGISTRATION",
  priceCents = 1800,
  quotaSize = 10,
  registrationCount = 1,
  signupClosed = false,
}: PaidEventOptions = {}) {
  const data = await createEventDataAndLogin({
    quotaOptions: { create: true, amount: 1, size: quotaSize },
    questionOptions: { create: false },
    registrationOptions: { create: true, amount: registrationCount },
  })
  const pool = poolFromUrl(TEST_DATABASE_URL)
  const [event] = data.events
  const [quota] = data.quotas
  if (signupClosed) {
    await pool.query(
      `update app_public.events
        set
          registration_start_time = now() - interval '2 days',
          registration_end_time = now() - interval '1 minute'
        where id = $1`,
      [event.id]
    )
  }
  await pool.query(
    `update app_public.events
      set
        payment_mode = $2::app_public.payment_mode,
        send_unpaid_email_on_close = $2::app_public.payment_mode = 'AFTER_REGISTRATION'
      where id = $1`,
    [event.id, paymentMode]
  )
  await pool.query(
    "update app_public.quotas set price_cents = $2 where id = $1",
    [quota.id, priceCents]
  )
  await pool.query(
    "update app_public.registrations set price_cents = $2 where event_id = $1",
    [event.id, paymentMode === "NONE" || priceCents === 0 ? null : priceCents]
  )
  await pool.query(
    "refresh materialized view app_hidden.registrations_status_and_position"
  )

  const registrations = data.registrations
  const tokens = registrations.map(
    (r) =>
      data.registrationSecrets.find((s) => s.registration_id === r.id)!
        .update_token as string
  )
  return { ...data, event, quota, registrations, tokens }
}

interface PaymentOptions {
  method?: "STRIPE" | "MANUAL"
  status?: "PENDING" | "PAID" | "EXPIRED" | "REFUNDED"
  ticketAmountCents?: number
  sessionId?: string | null
  paymentIntentId?: string | null
}

/** Inserts a payment row, as the server or worker would. */
export async function insertPayment(
  pool: Pool,
  registration: { id: string; event_id: string; quota_id: string },
  {
    method = "STRIPE",
    status = "PAID",
    ticketAmountCents = 1800,
    sessionId = null,
    paymentIntentId = null,
  }: PaymentOptions = {}
) {
  const {
    rows: [payment],
  } = await pool.query(
    `insert into app_public.payments(
      registration_id, event_id, quota_id, event_name, quota_title,
      method, status, ticket_amount_cents, service_fee_cents, paid_at,
      stripe_checkout_session_id, stripe_payment_intent_id
    )
    values ($1, $2, $3, '{"fi": "Tapahtuma", "en": "Event"}', '{"fi": "Kiintiö", "en": "Quota"}',
      $4::app_public.payment_method, $5::app_public.payment_status, $6,
      case when $4::app_public.payment_method = 'STRIPE' then 25 else 0 end,
      case when $5::app_public.payment_status = 'PAID' then now() end,
      $7, $8)
    returning *`,
    [
      registration.id,
      registration.event_id,
      registration.quota_id,
      method,
      status,
      ticketAmountCents,
      sessionId,
      paymentIntentId,
    ]
  )
  return payment
}

export async function paymentsOfEvent(pool: Pool, eventId: string) {
  const { rows } = await pool.query(
    "select * from app_public.payments where event_id = $1 order by created_at, id",
    [eventId]
  )
  return rows
}

export async function jobsOf(pool: Pool, taskIdentifier: string) {
  const { rows } = await pool.query(
    `select jobs.payload
      from graphile_worker._private_jobs as jobs
      join graphile_worker._private_tasks as tasks on tasks.id = jobs.task_id
      where tasks.identifier = $1
      order by jobs.id`,
    [taskIdentifier]
  )
  return rows.map((row) => row.payload)
}
