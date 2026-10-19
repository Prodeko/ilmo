import { Pool } from "pg"

import {
  createEventCategories,
  createEvents,
  createQuotas,
  createRegistrations,
  createRegistrationSecrets,
  poolFromUrl,
  TEST_DATABASE_URL,
} from "../../__tests__/helpers"
import { getStripe, resetStripeClient } from "../src/payments"

import type { JobHelpers, Task } from "graphile-worker"

export { deleteTestData, getEmails } from "../../__tests__/helpers"

/*
 * Shared setup for the worker task tests. Tasks are called directly with job
 * helpers backed by the test database, so their queries and queued jobs are
 * real; test files mock the `stripe` package with `mockStripeModule`.
 */

export function testPool(): Pool {
  return poolFromUrl(TEST_DATABASE_URL)
}

/******************************************************************************/
// Payments flag

const PAYMENTS_ENV_KEYS = [
  "PAYMENTS_ENABLED",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const

/**
 * Turns payments on for each test of the file and restores the environment
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
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret"
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
  checkout: { sessions: { retrieve: jest.Mock } }
  refunds: { create: jest.Mock }
}

/** The fake client behind getStripe(); payments must be enabled. */
export function stripeMock(): StripeMock {
  return getStripe() as unknown as StripeMock
}

/******************************************************************************/
// Running tasks

export type TestJobHelpers = JobHelpers & {
  logger: {
    info: jest.Mock
    warn: jest.Mock
    error: jest.Mock
    debug: jest.Mock
  }
}

/**
 * Job helpers like graphile-worker's: `query` and `withPgClient` use the test
 * database and `addJob` really queues the job, so tests can read it back
 * with `jobsOf`.
 */
export function jobHelpers(pool: Pool = testPool()): TestJobHelpers {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
  const helpers = {
    logger,
    query: (text: string, values?: unknown[]) => pool.query(text, values),
    withPgClient: async (callback) => {
      const client = await pool.connect()
      try {
        return await callback(client)
      } finally {
        client.release()
      }
    },
    addJob: async (identifier: string, payload: unknown) => {
      await pool.query("select graphile_worker.add_job($1, $2::json)", [
        identifier,
        JSON.stringify(payload ?? {}),
      ])
    },
  }
  return helpers as unknown as TestJobHelpers
}

export async function runTask(
  task: Task,
  payload: unknown,
  helpers: TestJobHelpers = jobHelpers()
) {
  await task(payload as any, helpers)
  return helpers
}

/** Payloads of the queued jobs of a task, oldest first. */
export async function jobsOf(taskIdentifier: string, pool: Pool = testPool()) {
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

/******************************************************************************/
// Data

export type PaymentMode = "NONE" | "DURING_REGISTRATION" | "AFTER_REGISTRATION"

interface PaidEventOptions {
  paymentMode?: PaymentMode
  priceCents?: number
  quotaSize?: number
  registrationCount?: number
  /** Move registration end into the past (signup closed). */
  signupClosed?: boolean
  /** Defaults to true in AFTER_REGISTRATION mode, false otherwise. */
  sendUnpaidEmailOnClose?: boolean
}

/**
 * Commits an organization, a category, an event with one quota and some
 * finished registrations (with secrets), then sets the payment mode and the
 * quota price. Registrations are inserted one statement at a time, so their
 * created_at differ and, with `quotaSize` smaller than `registrationCount`,
 * the last ones are queued. Clears the jobs the inserts queued.
 */
export async function createPaidEvent({
  paymentMode = "DURING_REGISTRATION",
  priceCents = 1800,
  quotaSize = 10,
  registrationCount = 1,
  signupClosed = false,
  sendUnpaidEmailOnClose = paymentMode === "AFTER_REGISTRATION",
}: PaidEventOptions = {}) {
  const pool = testPool()
  const client = await pool.connect()
  try {
    const {
      rows: [organization],
    } = await client.query(
      `insert into app_public.organizations(slug, name, color)
        values ('worker-org-' || gen_random_uuid(), 'Worker org', '#002e7d')
        returning *`
    )
    const [category] = await createEventCategories(client, 1, organization.id)
    const [createdEvent] = await createEvents(
      client,
      1,
      organization.id,
      category.id,
      true
    )
    const [createdQuota] = await createQuotas(
      client,
      1,
      createdEvent.id,
      quotaSize
    )
    await client.query(
      `update app_public.events
        set
          payment_mode = $2::app_public.payment_mode,
          send_unpaid_email_on_close = $3
        where id = $1`,
      [createdEvent.id, paymentMode, sendUnpaidEmailOnClose]
    )
    await client.query(
      "update app_public.quotas set price_cents = $2 where id = $1",
      [createdQuota.id, priceCents]
    )
    const created = await createRegistrations(
      client,
      registrationCount,
      createdEvent.id,
      createdQuota.id,
      []
    )
    const secrets = await createRegistrationSecrets(
      client,
      created,
      createdEvent.id,
      createdQuota.id
    )
    if (signupClosed) {
      await client.query(
        `update app_public.events
          set
            registration_start_time = now() - interval '2 days',
            registration_end_time = now() - interval '1 minute'
          where id = $1`,
        [createdEvent.id]
      )
    }
    await client.query(
      "refresh materialized view app_hidden.registrations_status_and_position"
    )
    await client.query("delete from graphile_worker._private_jobs")

    const {
      rows: [event],
    } = await client.query("select * from app_public.events where id = $1", [
      createdEvent.id,
    ])
    const {
      rows: [quota],
    } = await client.query("select * from app_public.quotas where id = $1", [
      createdQuota.id,
    ])
    const { rows: registrations } = await client.query(
      "select * from app_public.registrations where event_id = $1 order by created_at, id",
      [createdEvent.id]
    )
    const tokens = registrations.map(
      (r) =>
        secrets.find((s) => s.registration_id === r.id)!.update_token as string
    )
    return { organization, event, quota, registrations, tokens }
  } finally {
    client.release()
  }
}

interface PaymentOptions {
  method?: "STRIPE" | "MANUAL"
  status?: "PENDING" | "PAID" | "EXPIRED" | "REFUNDED"
  ticketAmountCents?: number
  sessionId?: string | null
  paymentIntentId?: string | null
  /** Insert without a registration (deleted, or a detached duplicate). */
  detached?: boolean
}

let paymentCounter = 0

/** Inserts a payment row, as the server would. */
export async function insertPayment(
  registration: { id: string; event_id: string; quota_id: string },
  {
    method = "STRIPE",
    status = "PAID",
    ticketAmountCents = 1800,
    sessionId,
    paymentIntentId,
    detached = false,
  }: PaymentOptions = {}
) {
  paymentCounter++
  const stripe = method === "STRIPE"
  const {
    rows: [payment],
  } = await testPool().query(
    `insert into app_public.payments(
      registration_id, event_id, quota_id, event_name, quota_title,
      method, status, ticket_amount_cents, service_fee_cents, paid_at,
      stripe_checkout_session_id, stripe_payment_intent_id
    )
    values ($1, $2, $3, '{"fi": "Syyssitsit", "en": "Autumn sitsit"}', '{"fi": "Jäsenet", "en": "Members"}',
      $4::app_public.payment_method, $5::app_public.payment_status, $6,
      case when $4::app_public.payment_method = 'STRIPE' then 25 else 0 end,
      case when $5::app_public.payment_status in ('PAID', 'REFUNDED') then '2026-10-17 14:32:00'::timestamptz end,
      $7, $8)
    returning *`,
    [
      detached ? null : registration.id,
      registration.event_id,
      registration.quota_id,
      method,
      status,
      ticketAmountCents,
      sessionId !== undefined
        ? sessionId
        : stripe
          ? `cs_test_${paymentCounter}`
          : null,
      paymentIntentId !== undefined
        ? paymentIntentId
        : stripe
          ? `pi_test_${paymentCounter}`
          : null,
    ]
  )
  return payment
}

export async function paymentById(id: string) {
  const {
    rows: [payment],
  } = await testPool().query(
    "select * from app_public.payments where id = $1",
    [id]
  )
  return payment
}

/** Runs queued send_email payloads through the real send_email task. */
export async function sendQueuedEmails(sendEmail: Task) {
  const payloads = await jobsOf("send_email")
  for (const payload of payloads) {
    await sendEmail(payload, jobHelpers())
  }
  return payloads
}
