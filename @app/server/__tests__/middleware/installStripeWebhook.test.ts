import { fastify, FastifyInstance } from "fastify"
import { Pool } from "pg"

import installCSRFProtection from "../../src/middleware/installCSRFProtection"
import installSession from "../../src/middleware/installSession"
import installStripeWebhook, {
  STRIPE_WEBHOOK_PATH,
} from "../../src/middleware/installStripeWebhook"
import { deleteTestData } from "../helpers"
import {
  createPaidEvent,
  disablePayments,
  enablePaymentsForEachTest,
  insertPayment,
  jobsOf,
  paymentsOfEvent,
  STRIPE_WEBHOOK_SECRET,
} from "../payments"

jest.mock("stripe", () => require("../stripeMock").mockStripeModule())

enablePaymentsForEachTest()

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
  app.register(installStripeWebhook)
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
  it("rejects a request without a signature", async () => {
    const res = await post(completedSession("cs_test_nosig"), {
      signature: null,
    })
    expect(res.statusCode).toBe(400)
    expect(await processedEvents()).toEqual([])
  })

  it("rejects a bad signature", async () => {
    const event = completedSession("cs_test_badsig")
    const res = await post(event, {
      signature: sign(JSON.stringify(event), "whsec_wrong"),
    })
    expect(res.statusCode).toBe(400)
    expect(await processedEvents()).toEqual([])
  })

  it("rejects a signature over a different body", async () => {
    const event = completedSession("cs_test_tampered")
    const res = await post(event, {
      signature: sign(JSON.stringify({ ...event, id: "evt_other" })),
    })
    expect(res.statusCode).toBe(400)
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
    expect(await jobsOf(pool, "payment__send_received_email")).toEqual([
      { paymentId: payment.id },
    ])
    expect(await jobsOf(pool, "payment__refund")).toEqual([])
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

  it("refunds the ticket price when the registration was deleted meanwhile", async () => {
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
    expect(await jobsOf(pool, "payment__refund")).toEqual([
      { paymentId: payment.id },
    ])
    expect(await jobsOf(pool, "payment__send_received_email")).toEqual([])
  })

  it("refunds a second payment for an already paid registration in full", async () => {
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
    expect(await jobsOf(pool, "payment__refund")).toEqual([
      { paymentId: second.id, full: true },
    ])
    expect(await jobsOf(pool, "payment__send_received_email")).toEqual([])
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

  it("does nothing for an unknown session or an unpaid one", async () => {
    const { registrations } = await createPaidEvent()
    const payment = await insertPayment(pool, registrations[0], {
      status: "PENDING",
      sessionId: "cs_test_unpaid",
    })

    expect((await post(completedSession("cs_test_unknown"))).statusCode).toBe(
      200
    )
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
    failingApp.register(installStripeWebhook)
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
  it("expires the pending payment", async () => {
    const { registrations } = await createPaidEvent()
    const pending = await insertPayment(pool, registrations[0], {
      status: "PENDING",
      sessionId: "cs_test_expired",
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
  })

  it("never expires a paid payment", async () => {
    const { registrations } = await createPaidEvent()
    const paid = await insertPayment(pool, registrations[0], {
      sessionId: "cs_test_paid_then_expired",
    })
    await post(
      stripeEvent("checkout.session.expired", {
        id: "cs_test_paid_then_expired",
        object: "checkout.session",
      })
    )
    expect((await paymentById(paid.id)).status).toBe("PAID")
  })
})

describe("charge.refunded", () => {
  function chargeRefunded(paymentIntent: string, amountRefunded: number) {
    return stripeEvent("charge.refunded", {
      id: `ch_for_${paymentIntent}`,
      object: "charge",
      payment_intent: paymentIntent,
      amount: 1825,
      amount_refunded: amountRefunded,
      refunded: amountRefunded === 1825,
      refunds: {
        object: "list",
        data: [{ id: `re_for_${paymentIntent}`, object: "refund" }],
      },
    })
  }

  it("records a refund of the ticket price", async () => {
    const { registrations } = await createPaidEvent()
    const payment = await insertPayment(pool, registrations[0], {
      paymentIntentId: "pi_refunded",
    })

    const res = await post(chargeRefunded("pi_refunded", 1800))
    expect(res.statusCode).toBe(200)
    expect(await paymentById(payment.id)).toMatchObject({
      status: "REFUNDED",
      refunded_amount_cents: 1800,
      refunded_at: expect.any(Date),
      stripe_refund_id: "re_for_pi_refunded",
      // Bookkeeping keeps the link to the registration
      registration_id: registrations[0].id,
    })
  })

  it("keeps the payment paid after a smaller, partial refund", async () => {
    const { registrations } = await createPaidEvent()
    const payment = await insertPayment(pool, registrations[0], {
      paymentIntentId: "pi_partial",
    })

    await post(chargeRefunded("pi_partial", 500))
    expect(await paymentById(payment.id)).toMatchObject({
      status: "PAID",
      refunded_amount_cents: 500,
      refunded_at: expect.any(Date),
    })
  })

  it("ignores a refund of an unknown payment", async () => {
    const res = await post(chargeRefunded("pi_unknown", 1800))
    expect(res.statusCode).toBe(200)
    expect(await processedEvents()).toHaveLength(1)
  })
})

it("acknowledges event types it does not handle", async () => {
  const res = await post(
    stripeEvent("customer.created", { id: "cus_1", object: "customer" })
  )
  expect(res.statusCode).toBe(200)
})

describe("CSRF", () => {
  let csrfApp: FastifyInstance

  beforeEach(async () => {
    csrfApp = fastify()
    csrfApp.decorate("rootPgPool", pool)
    await csrfApp.register(installSession)
    await csrfApp.register(installCSRFProtection)
    await csrfApp.register(installStripeWebhook)
    for (const url of [`${STRIPE_WEBHOOK_PATH}/other`, "/graphql"]) {
      csrfApp.post(url, async () => ({ ok: true }))
    }
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

  it("lets Stripe post to the webhook without a CSRF token", async () => {
    expect((await postWithoutCsrfToken(STRIPE_WEBHOOK_PATH)).statusCode).toBe(
      200
    )
  })

  it.each([
    `${STRIPE_WEBHOOK_PATH}/other`,
    `${STRIPE_WEBHOOK_PATH}?x=1`,
    "/graphql",
  ])("still protects %s", async (url) => {
    expect((await postWithoutCsrfToken(url)).statusCode).toBe(403)
  })

  it("protects the webhook path too while payments are disabled", async () => {
    disablePayments()
    expect((await postWithoutCsrfToken(STRIPE_WEBHOOK_PATH)).statusCode).toBe(
      403
    )
  })
})
