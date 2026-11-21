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

const STRIPE_ENV_KEYS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const

export const STRIPE_WEBHOOK_SECRET = "whsec_test_secret"

/**
 * Gives the test file a Stripe configuration (test keys; the `stripe`
 * package is mocked) and restores the environment afterwards, since jest
 * shares the process between test files. Whether payments are on is the
 * `payments` feature flag: switch it with `setFeatureFlag` from ./helpers.
 */
export function configureStripeForEachTest() {
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const key of STRIPE_ENV_KEYS) {
      saved[key] = process.env[key]
    }
    process.env.STRIPE_SECRET_KEY = "sk_test_123"
    process.env.STRIPE_WEBHOOK_SECRET = STRIPE_WEBHOOK_SECRET
    resetStripeClient()
  })
  afterEach(() => {
    for (const key of STRIPE_ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    resetStripeClient()
  })
}

/** Removes the Stripe configuration for the rest of the current test. */
export function unconfigureStripe() {
  for (const key of STRIPE_ENV_KEYS) {
    delete process.env[key]
  }
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
  webhooks: {
    generateTestHeaderString(opts: { payload: string; secret: string }): string
  }
}

/** The fake client behind getStripe(); Stripe must be configured. */
export function stripeMock(): StripeMock {
  return getStripe() as unknown as StripeMock
}

interface PaidEventOptions {
  priceCents?: number
  quotaSize?: number
  registrationCount?: number
  /**
   * Move registration end into the past (default), so that the registrations
   * can be paid. False leaves registration open.
   */
  signupClosed?: boolean
}

/**
 * Commits an event with one quota and some registrations (with secrets), as
 * createEventDataAndLogin does, then makes it paid by setting the quota
 * price. Registrations are
 * in creation order, so with `quotaSize` smaller than `registrationCount`
 * the last ones are queued.
 */
export async function createPaidEvent({
  priceCents = 1800,
  quotaSize = 10,
  registrationCount = 1,
  signupClosed = true,
}: PaidEventOptions = {}) {
  const data = await createEventDataAndLogin({
    quotaOptions: { create: true, amount: 1, size: quotaSize },
    questionOptions: { create: false },
    registrationOptions: { create: true, amount: registrationCount },
  })
  const pool = poolFromUrl(TEST_DATABASE_URL)
  let [event] = data.events
  const [quota] = data.quotas
  if (signupClosed) {
    ;({
      rows: [event],
    } = await pool.query(
      `update app_public.events
        set
          registration_start_time = now() - interval '2 days',
          registration_end_time = now() - interval '1 minute'
        where id = $1
        returning *`,
      [event.id]
    ))
  }
  await pool.query(
    "update app_public.quotas set price_cents = $2 where id = $1",
    [quota.id, priceCents]
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
  status?: "PENDING" | "PAID" | "EXPIRED"
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

/**
 * Payloads of the queued jobs of a task, or of every payment task
 * (`payment__*`) when omitted.
 */
export async function jobsOf(pool: Pool, taskIdentifier?: string) {
  const { rows } = await pool.query(
    `select jobs.payload
      from graphile_worker._private_jobs as jobs
      join graphile_worker._private_tasks as tasks on tasks.id = jobs.task_id
      where coalesce(tasks.identifier = $1::text, tasks.identifier like 'payment\\_%')
      order by jobs.id`,
    [taskIdentifier ?? null]
  )
  return rows.map((row) => row.payload)
}
