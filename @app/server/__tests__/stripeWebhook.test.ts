import { fastify, FastifyInstance } from "fastify"
import { Pool } from "pg"

import installCSRFProtection from "../src/middleware/installCSRFProtection"
import installExternalRoutes from "../src/middleware/installExternalRoutes"
import installSession from "../src/middleware/installSession"
import { STRIPE_WEBHOOK_PATH, stripeWebhook } from "../src/stripeWebhook"

import { deleteTestData } from "./helpers"
import {
  configureStripeForEachTest,
  createPaidEvent,
  insertPayment,
  jobsOf,
  paymentsOfEvent,
  STRIPE_WEBHOOK_SECRET,
} from "./payments"

jest.mock("stripe", () => require("./stripeMock").mockStripeModule())

// The `payments` flag stays off in this file: the webhook is never gated,
// so payments started before the switch still settle.
configureStripeForEachTest()

/** The webhook as the external route installer registers it. */
const installStripeWebhook = (instance: FastifyInstance) =>
  instance.register(installExternalRoutes, {
    externalRoutes: [stripeWebhook],
  })

let pool: Pool
let app: FastifyInstance

beforeAll(() => {
  pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
})

afterAll(async () => {
  await pool.end()
})

beforeEach(async () => {
  await deleteTestData()
  app = fastify()
  app.decorate("rootPgPool", pool)
  installStripeWebhook(app)
  // An ordinary JSON route next to the webhook: the raw-body parser must not
  // leak out of the webhook plugin.
  app.post("/json", async (request) => ({ body: request.body }))
  await app.ready()
})

afterEach(async () => {
  await app.close()
})

let eventCounter = 0

function stripeEvent(type: string, object: Record<string, unknown>) {
  eventCounter++
  return {
    id: `evt_test_${eventCounter}_${Date.now()}`,
    object: "event",
    type,
    data: { object },
  }
}

// The real webhooks helper, usable whatever the environment
const ActualStripe = jest.requireActual("stripe")
const { webhooks } = new ActualStripe("sk_test_123")

function sign(payload: string, secret = STRIPE_WEBHOOK_SECRET): string {
  return webhooks.generateTestHeaderString({ payload, secret })
}

async function post(
  event: object,
  { signature }: { signature?: string | null } = {}
) {
  const payload = JSON.stringify(event)
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
  }
  if (signature !== null) {
    headers["stripe-signature"] = signature ?? sign(payload)
  }
  return app.inject({
    method: "POST",
    url: STRIPE_WEBHOOK_PATH,
    headers,
    payload,
  })
}

async function processedEvents() {
  const { rows } = await pool.query(
    "select id, type from app_private.stripe_events order by processed_at"
  )
  return rows
}

function completedSession(
  sessionId: string,
  extra: Record<string, unknown> = {}
) {
  return stripeEvent("checkout.session.completed", {
    id: sessionId,
    object: "checkout.session",
    payment_status: "paid",
    status: "complete",
    payment_intent: `pi_for_${sessionId}`,
    // What insertPayment's defaults charge: 1800 ticket + 25 service fee
    amount_total: 1825,
    currency: "eur",
    metadata: {},
    ...extra,
  })
}

async function paymentById(id: string) {
  const {
    rows: [payment],
  } = await pool.query("select * from app_public.payments where id = $1", [id])
  return payment
}

describe("signature", () => {
  it.each<[string, (payload: string) => string | null]>([
    ["without a signature", () => null],
    ["with a bad signature", (payload) => sign(payload, "whsec_wrong")],
  ])("rejects a request %s", async (_name, signatureOf) => {
    const event = completedSession("cs_test_badsig")
    const res = await post(event, {
      signature: signatureOf(JSON.stringify(event)),
    })
    expect(res.statusCode).toBe(400)
    expect(await processedEvents()).toEqual([])
  })

  it("keeps JSON parsing for other routes", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/json",
      payload: { hello: "world" },
    })
    expect(res.json()).toEqual({ body: { hello: "world" } })
  })
})

describe("checkout.session.completed", () => {
  it("marks the payment paid and queues the payment received email", async () => {
    const { event, registrations } = await createPaidEvent()
    const payment = await insertPayment(pool, registrations[0], {
      status: "PENDING",
      sessionId: "cs_test_paid",
    })

    const stripeEventPayload = completedSession("cs_test_paid")
    const res = await post(stripeEventPayload)
    expect(res.statusCode).toBe(200)

    expect(await paymentById(payment.id)).toMatchObject({
      status: "PAID",
      registration_id: registrations[0].id,
      stripe_payment_intent_id: "pi_for_cs_test_paid",
      paid_at: expect.any(Date),
    })
    expect(await jobsOf(pool)).toEqual([{ paymentId: payment.id }])
    expect(await jobsOf(pool, "payment__send_received_email")).toEqual([
      { paymentId: payment.id },
    ])
    expect(await processedEvents()).toEqual([
      { id: stripeEventPayload.id, type: "checkout.session.completed" },
    ])
    expect((await paymentsOfEvent(pool, event.id)).length).toBe(1)
  })

  it("ignores a redelivered event", async () => {
    const { registrations } = await createPaidEvent()
    const payment = await insertPayment(pool, registrations[0], {
      status: "PENDING",
      sessionId: "cs_test_twice",
    })
    const stripeEventPayload = completedSession("cs_test_twice")

    expect((await post(stripeEventPayload)).statusCode).toBe(200)
    // Undo the effect: a reprocessed event would mark it paid again
    await pool.query(
      "update app_public.payments set status = 'PENDING' where id = $1",
      [payment.id]
    )
    expect((await post(stripeEventPayload)).statusCode).toBe(200)

    expect((await paymentById(payment.id)).status).toBe("PENDING")
    expect(await jobsOf(pool, "payment__send_received_email")).toHaveLength(1)
  })

  it("ignores a second, different event for an already paid session", async () => {
    const { registrations } = await createPaidEvent()
    await insertPayment(pool, registrations[0], {
      status: "PENDING",
      sessionId: "cs_test_again",
    })
    await post(completedSession("cs_test_again"))
    expect((await post(completedSession("cs_test_again"))).statusCode).toBe(200)
    expect(await jobsOf(pool, "payment__send_received_email")).toHaveLength(1)
  })

  it("keeps the payment, detached and unrefunded, when the registration was deleted meanwhile", async () => {
    const { registrations } = await createPaidEvent()
    const payment = await insertPayment(pool, registrations[0], {
      status: "PENDING",
      sessionId: "cs_test_deleted",
    })
    await pool.query("delete from app_public.registrations where id = $1", [
      registrations[0].id,
    ])

    expect((await post(completedSession("cs_test_deleted"))).statusCode).toBe(
      200
    )
    expect(await paymentById(payment.id)).toMatchObject({
      status: "PAID",
      registration_id: null,
      stripe_payment_intent_id: "pi_for_cs_test_deleted",
    })
    expect(await jobsOf(pool)).toEqual([])
  })

  it("keeps a second payment for an already paid registration, detached and unrefunded", async () => {
    const { registrations } = await createPaidEvent()
    const manual = await insertPayment(pool, registrations[0], {
      method: "MANUAL",
    })
    const second = await insertPayment(pool, registrations[0], {
      status: "PENDING",
      sessionId: "cs_test_second",
    })

    expect((await post(completedSession("cs_test_second"))).statusCode).toBe(
      200
    )
    expect(await paymentById(second.id)).toMatchObject({
      status: "PAID",
      // Detached: a registration can have only one PAID payment
      registration_id: null,
      stripe_payment_intent_id: "pi_for_cs_test_second",
    })
    expect(await paymentById(manual.id)).toMatchObject({
      status: "PAID",
      registration_id: registrations[0].id,
    })
    expect(await jobsOf(pool)).toEqual([])
  })

  it("finds the payment by its metadata when the session id was not stored", async () => {
    const { registrations } = await createPaidEvent()
    const payment = await insertPayment(pool, registrations[0], {
      status: "PENDING",
    })

    const res = await post(
      completedSession("cs_test_metadata", {
        metadata: { payment_id: payment.id },
      })
    )
    expect(res.statusCode).toBe(200)
    expect(await paymentById(payment.id)).toMatchObject({
      status: "PAID",
      stripe_checkout_session_id: "cs_test_metadata",
    })
  })

  it.each([
    ["amount", { amount_total: 1700 }],
    ["currency", { currency: "usd" }],
  ])(
    "keeps a session whose %s differs from the payment row, detached and unrefunded",
    async (_name, extra) => {
      const { registrations } = await createPaidEvent()
      const payment = await insertPayment(pool, registrations[0], {
        status: "PENDING",
        sessionId: "cs_test_mismatch",
      })

      expect(
        (await post(completedSession("cs_test_mismatch", extra))).statusCode
      ).toBe(200)
      expect(await paymentById(payment.id)).toMatchObject({
        status: "PAID",
        registration_id: null,
        stripe_payment_intent_id: "pi_for_cs_test_mismatch",
      })
      expect(await jobsOf(pool)).toEqual([])
    }
  )

  it("records and refunds nothing for a paid session without a payment row", async () => {
    const res = await post(
      completedSession("cs_test_orphan", {
        metadata: { payment_id: "00000000-0000-4000-8000-000000000000" },
      })
    )
    expect(res.statusCode).toBe(200)
    const { rows } = await pool.query(
      "select count(*)::int as count from app_public.payments"
    )
    expect(rows).toEqual([{ count: 0 }])
    expect(await jobsOf(pool)).toEqual([])
  })

  it("does nothing for an unpaid session", async () => {
    const { registrations } = await createPaidEvent()
    const payment = await insertPayment(pool, registrations[0], {
      status: "PENDING",
      sessionId: "cs_test_unpaid",
    })

    expect(
      (
        await post(
          completedSession("cs_test_unpaid", { payment_status: "unpaid" })
        )
      ).statusCode
    ).toBe(200)
    expect((await paymentById(payment.id)).status).toBe("PENDING")
  })

  it("answers 500 and records nothing when the database fails, so Stripe retries", async () => {
    const { registrations } = await createPaidEvent()
    const payment = await insertPayment(pool, registrations[0], {
      status: "PENDING",
      sessionId: "cs_test_dberror",
    })
    // A pool whose clients fail on the payment update
    const failingPool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    })
    const failingApp = fastify()
    failingApp.decorate("rootPgPool", {
      connect: async () => {
        const client = await failingPool.connect()
        const query = client.query.bind(client)
        return Object.assign(Object.create(client), {
          query: (text: unknown, ...rest: unknown[]) =>
            typeof text === "string" && text.includes("status = 'PAID'")
              ? Promise.reject(new Error("database is down"))
              : (query as any)(text, ...rest),
          release: () => client.release(true),
        })
      },
    } as unknown as Pool)
    installStripeWebhook(failingApp)
    try {
      const event = completedSession("cs_test_dberror")
      const payload = JSON.stringify(event)
      const res = await failingApp.inject({
        method: "POST",
        url: STRIPE_WEBHOOK_PATH,
        headers: {
          "content-type": "application/json",
          "stripe-signature": sign(payload),
        },
        payload,
      })
      expect(res.statusCode).toBe(500)
      expect(await processedEvents()).toEqual([])
      expect((await paymentById(payment.id)).status).toBe("PENDING")

      // Stripe's retry goes through once the database is back
      expect((await post(event)).statusCode).toBe(200)
      expect((await paymentById(payment.id)).status).toBe("PAID")
    } finally {
      await failingApp.close()
      await failingPool.end()
    }
  })
})

describe("checkout.session.expired", () => {
  it("expires the pending payment, never a paid one", async () => {
    const { registrations } = await createPaidEvent()
    const pending = await insertPayment(pool, registrations[0], {
      status: "PENDING",
      sessionId: "cs_test_expired",
    })
    const paid = await insertPayment(pool, registrations[0], {
      sessionId: "cs_test_paid_then_expired",
    })

    const res = await post(
      stripeEvent("checkout.session.expired", {
        id: "cs_test_expired",
        object: "checkout.session",
        status: "expired",
        payment_status: "unpaid",
      })
    )
    expect(res.statusCode).toBe(200)
    expect((await paymentById(pending.id)).status).toBe("EXPIRED")

    await post(
      stripeEvent("checkout.session.expired", {
        id: "cs_test_paid_then_expired",
        object: "checkout.session",
      })
    )
    expect((await paymentById(paid.id)).status).toBe("PAID")
  })
})

describe("CSRF", () => {
  let csrfApp: FastifyInstance

  beforeEach(async () => {
    csrfApp = fastify()
    csrfApp.decorate("rootPgPool", pool)
    await csrfApp.register(installSession)
    await csrfApp.register(installCSRFProtection)
    await installStripeWebhook(csrfApp)
    csrfApp.post(`${STRIPE_WEBHOOK_PATH}/other`, async () => ({ ok: true }))
    await csrfApp.ready()
  })

  afterEach(async () => {
    await csrfApp.close()
  })

  async function postWithoutCsrfToken(url: string) {
    const payload = JSON.stringify(stripeEvent("customer.created", {}))
    return csrfApp.inject({
      method: "POST",
      url,
      headers: {
        "content-type": "application/json",
        "stripe-signature": sign(payload),
      },
      payload,
    })
  }

  it("exempts the webhook, ignoring a query string as routing does", async () => {
    expect((await postWithoutCsrfToken(STRIPE_WEBHOOK_PATH)).statusCode).toBe(
      200
    )
    expect(
      (await postWithoutCsrfToken(`${STRIPE_WEBHOOK_PATH}?x=1`)).statusCode
    ).toBe(200)
  })

  it("still protects a sub-path", async () => {
    expect(
      (await postWithoutCsrfToken(`${STRIPE_WEBHOOK_PATH}/other`)).statusCode
    ).toBe(403)
  })
})
