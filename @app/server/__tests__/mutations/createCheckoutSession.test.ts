import {
  deleteTestData,
  poolFromUrl,
  runGraphQLQuery,
  setup,
  teardown,
  TEST_DATABASE_URL,
} from "../helpers"
import {
  createPaidEvent,
  disablePayments,
  enablePaymentsForEachTest,
  insertPayment,
  PaymentMode,
  paymentsOfEvent,
  stripeMock,
} from "../payments"

jest.mock("stripe", () => require("../stripeMock").mockStripeModule())

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)
enablePaymentsForEachTest()

const pool = () => poolFromUrl(TEST_DATABASE_URL)

const CreateCheckoutSessionMutation = `
  mutation CreateCheckoutSession($updateToken: String!, $language: String) {
    createCheckoutSession(updateToken: $updateToken, language: $language) {
      url
    }
  }
`

let sessionCounter = 0

beforeEach(() => {
  const { sessions } = stripeMock().checkout
  sessions.create.mockReset()
  sessions.expire.mockReset()
  sessions.retrieve.mockReset()
  sessions.create.mockImplementation(async () => {
    sessionCounter++
    return {
      id: `cs_test_${sessionCounter}`,
      url: `https://checkout.stripe.com/c/pay/cs_test_${sessionCounter}`,
    }
  })
  sessions.expire.mockImplementation(async (id: string) => ({
    id,
    status: "expired",
  }))
})

async function createCheckoutSession(updateToken: string, language?: string) {
  return runGraphQLQuery(
    CreateCheckoutSessionMutation,
    { updateToken, language },
    {},
    () => {},
    true,
    false
  )
}

async function expectRefusal(updateToken: string, code: string) {
  const result = await createCheckoutSession(updateToken)
  expect(result.data?.createCheckoutSession).toBeFalsy()
  expect(result.errors).toHaveLength(1)
  expect(result.errors![0].extensions!.exception).toMatchObject({ code })
  expect(stripeMock().checkout.sessions.create).not.toHaveBeenCalled()
}

/** Replaces the generated ids in the params so they can be snapshotted. */
function maskIds(value: unknown, ids: Record<string, string>): unknown {
  let json = JSON.stringify(value)
  for (const [name, id] of Object.entries(ids)) {
    json = json.split(id).join(`[${name}]`)
  }
  return JSON.parse(json)
}

describe("createCheckoutSession", () => {
  it("creates a card-only Checkout Session with two line items and metadata", async () => {
    const { event, quota, registrations, tokens } = await createPaidEvent()
    const [registration] = registrations

    const result = await createCheckoutSession(tokens[0])
    expect(result.errors).toBeFalsy()
    expect(result.data!.createCheckoutSession).toEqual({
      url: expect.stringMatching(
        /^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_\d+$/
      ),
    })

    const [payment] = await paymentsOfEvent(pool(), event.id)
    expect(payment).toMatchObject({
      registration_id: registration.id,
      event_id: event.id,
      quota_id: quota.id,
      event_name: event.name,
      quota_title: quota.title,
      method: "STRIPE",
      status: "PENDING",
      ticket_amount_cents: 1800,
      service_fee_cents: 25,
      currency: "eur",
      stripe_checkout_session_id: `cs_test_${sessionCounter}`,
      paid_at: null,
    })

    const { create } = stripeMock().checkout.sessions
    expect(create).toHaveBeenCalledTimes(1)
    const [params, options] = create.mock.calls[0]
    expect(options).toEqual({
      idempotencyKey: `checkout-session-${payment.id}`,
    })
    expect(params.allowed_payment_method_types).toEqual(["card"])
    expect(params.line_items).toHaveLength(2)
    expect(params.metadata).toEqual(params.payment_intent_data.metadata)
    expect(
      maskIds(params, {
        registrationId: registration.id,
        eventId: event.id,
        quotaId: quota.id,
        paymentId: payment.id,
        updateToken: tokens[0],
        eventSlug: event.slug,
        email: registration.email,
        eventName: event.name.fi,
        rootUrl: process.env.ROOT_URL!,
      })
    ).toMatchSnapshot()
  })

  it.each([
    ["en", "en", "en"],
    ["se", "sv", "se"],
    ["fi", "fi", "fi"],
    [undefined, "fi", "fi"],
    ["xx", "fi", "fi"],
  ])(
    "uses language %p as Stripe locale %p and returns to /%s/pay",
    async (language, locale, path) => {
      const { event, tokens } = await createPaidEvent()
      const result = await createCheckoutSession(tokens[0], language)
      expect(result.errors).toBeFalsy()
      const [params] = stripeMock().checkout.sessions.create.mock.calls[0]
      expect(params.locale).toBe(locale)
      const payUrl = `${process.env.ROOT_URL}/${path}/pay/${tokens[0]}`
      expect(params.success_url).toBe(`${payUrl}?status=success`)
      expect(params.cancel_url).toBe(`${payUrl}?status=cancelled`)
      const productName = params.line_items[0].price_data.product_data.name
      expect(productName).toBe(
        `${language === "en" || language === "se" ? event.name.en : event.name.fi} – ${
          language === "en" || language === "se" ? "Quota 0" : "Kiintiö 0"
        }`
      )
    }
  )

  it("expires the registration's older pending session", async () => {
    const { event, tokens } = await createPaidEvent()

    await createCheckoutSession(tokens[0])
    const firstSessionId = `cs_test_${sessionCounter}`
    const result = await createCheckoutSession(tokens[0])
    expect(result.errors).toBeFalsy()

    const { expire } = stripeMock().checkout.sessions
    expect(expire).toHaveBeenCalledTimes(1)
    expect(expire).toHaveBeenCalledWith(firstSessionId)
    const payments = await paymentsOfEvent(pool(), event.id)
    expect(
      payments.map((p) => [p.stripe_checkout_session_id, p.status])
    ).toEqual([
      [firstSessionId, "EXPIRED"],
      [`cs_test_${sessionCounter}`, "PENDING"],
    ])
  })

  it("accepts an older session that Stripe already expired", async () => {
    const { event, registrations, tokens } = await createPaidEvent()
    await insertPayment(pool(), registrations[0], {
      status: "PENDING",
      sessionId: "cs_test_old",
    })
    const { expire, retrieve } = stripeMock().checkout.sessions
    expire.mockRejectedValueOnce(new Error("Session is not open"))
    retrieve.mockResolvedValueOnce({ id: "cs_test_old", status: "expired" })

    const result = await createCheckoutSession(tokens[0])
    expect(result.errors).toBeFalsy()
    const payments = await paymentsOfEvent(pool(), event.id)
    expect(payments.map((p) => p.status)).toEqual(["EXPIRED", "PENDING"])
  })

  it("refuses while an older session's payment is being confirmed", async () => {
    const { event, registrations, tokens } = await createPaidEvent()
    await insertPayment(pool(), registrations[0], {
      status: "PENDING",
      sessionId: "cs_test_paid",
    })
    const { expire, retrieve } = stripeMock().checkout.sessions
    expire.mockRejectedValueOnce(new Error("Session is not open"))
    retrieve.mockResolvedValueOnce({ id: "cs_test_paid", status: "complete" })

    const result = await createCheckoutSession(tokens[0])
    expect(result.errors![0].extensions!.exception).toMatchObject({
      code: "ALREADY_PAID",
    })
    expect(stripeMock().checkout.sessions.create).not.toHaveBeenCalled()
    // Left for the webhook to mark paid
    const payments = await paymentsOfEvent(pool(), event.id)
    expect(payments.map((p) => p.status)).toEqual(["PENDING"])
  })

  it("leaves no payment row behind when Stripe fails", async () => {
    const { event, tokens } = await createPaidEvent()
    stripeMock().checkout.sessions.create.mockRejectedValueOnce(
      new Error("Stripe is down")
    )

    const result = await createCheckoutSession(tokens[0])
    expect(result.errors).toHaveLength(1)
    expect(await paymentsOfEvent(pool(), event.id)).toEqual([])
  })

  it("hides Stripe's error text behind CHECKOUT_FAILED", async () => {
    const { tokens } = await createPaidEvent()
    stripeMock().checkout.sessions.create.mockRejectedValueOnce(
      new Error("Invalid API Key provided: sk_live_****1234")
    )

    const result = await createCheckoutSession(tokens[0])
    expect(result.errors).toHaveLength(1)
    const [error] = result.errors!
    expect(error.extensions!.exception).toMatchObject({
      code: "CHECKOUT_FAILED",
    })
    expect(JSON.stringify(error)).not.toMatch(/sk_live|Invalid API Key/)
  })

  it("expires the new session again if saving it fails", async () => {
    const { event, registrations, tokens } = await createPaidEvent()
    // Another payment already holds the session id Stripe will return
    await insertPayment(pool(), registrations[0], {
      status: "EXPIRED",
      sessionId: "cs_test_taken",
    })
    stripeMock().checkout.sessions.create.mockResolvedValueOnce({
      id: "cs_test_taken",
      url: "https://checkout.stripe.com/c/pay/cs_test_taken",
    })

    const result = await createCheckoutSession(tokens[0])
    expect(result.errors).toHaveLength(1)
    expect(stripeMock().checkout.sessions.expire).toHaveBeenCalledWith(
      "cs_test_taken"
    )
    expect(
      (await paymentsOfEvent(pool(), event.id)).map((p) => p.status)
    ).toEqual(["EXPIRED"])
  })

  it("holds no lock on the registration while Stripe is called", async () => {
    const { registrations, tokens } = await createPaidEvent()
    const { create } = stripeMock().checkout.sessions
    let lockedDuringCall: boolean | null = null
    create.mockImplementationOnce(async () => {
      const client = await pool().connect()
      try {
        await client.query("begin")
        await client.query(
          "select 1 from app_public.registrations where id = $1 for update nowait",
          [registrations[0].id]
        )
        lockedDuringCall = false
      } catch {
        lockedDuringCall = true
      } finally {
        await client.query("rollback")
        client.release()
      }
      return {
        id: "cs_test_unlocked",
        url: "https://checkout.stripe.com/c/pay/cs_test_unlocked",
      }
    })

    const result = await createCheckoutSession(tokens[0])
    expect(result.errors).toBeFalsy()
    expect(lockedDuringCall).toBe(false)
  })

  it("gives up its session when a newer click expired its payment meanwhile", async () => {
    const { event, registrations, tokens } = await createPaidEvent()
    const { create, expire } = stripeMock().checkout.sessions
    create.mockImplementationOnce(async () => {
      // A second click's first step expires this call's pending row
      await pool().query(
        `update app_public.payments set status = 'EXPIRED'
          where registration_id = $1 and status = 'PENDING'`,
        [registrations[0].id]
      )
      return {
        id: "cs_test_superseded",
        url: "https://checkout.stripe.com/c/pay/cs_test_superseded",
      }
    })

    const result = await createCheckoutSession(tokens[0])
    expect(result.errors![0].extensions!.exception).toMatchObject({
      code: "CHECKOUT_FAILED",
    })
    expect(expire).toHaveBeenCalledWith("cs_test_superseded")
    expect(await paymentsOfEvent(pool(), event.id)).toEqual([])
  })

  describe("refusals", () => {
    it("PAYMENTS_DISABLED while payments are off", async () => {
      const { tokens } = await createPaidEvent()
      disablePayments()
      const result = await createCheckoutSession(tokens[0])
      expect(result.errors![0].extensions!.exception).toMatchObject({
        code: "PAYMENTS_DISABLED",
      })
    })

    it("REGISTRATION_NOT_FOUND for an unknown token", async () => {
      await createPaidEvent()
      await expectRefusal("not-a-token", "REGISTRATION_NOT_FOUND")
    })

    it("REGISTRATION_NOT_FOUND for an unfinished registration", async () => {
      const { registrations, tokens } = await createPaidEvent()
      await pool().query(
        "update app_public.registrations set is_finished = false where id = $1",
        [registrations[0].id]
      )
      await expectRefusal(tokens[0], "REGISTRATION_NOT_FOUND")
    })

    it.each<[string, { paymentMode?: PaymentMode; priceCents?: number }]>([
      ["an event without payments", { paymentMode: "NONE" }],
      ["a free quota", { priceCents: 0 }],
    ])("PAYMENT_NOT_REQUIRED for %s", async (_name, options) => {
      const { tokens } = await createPaidEvent(options)
      await expectRefusal(tokens[0], "PAYMENT_NOT_REQUIRED")
    })

    it.each(["STRIPE", "MANUAL"] as const)(
      "ALREADY_PAID for a %s payment",
      async (method) => {
        const { registrations, tokens } = await createPaidEvent()
        await insertPayment(pool(), registrations[0], { method })
        await expectRefusal(tokens[0], "ALREADY_PAID")
      }
    )

    it("PAYMENT_REFUNDED for a refunded registration", async () => {
      const { registrations, tokens } = await createPaidEvent()
      await insertPayment(pool(), registrations[0], { status: "REFUNDED" })
      await expectRefusal(tokens[0], "PAYMENT_REFUNDED")
    })

    it("IN_QUEUE for a queued registration", async () => {
      const { registrations, tokens } = await createPaidEvent({
        quotaSize: 1,
        registrationCount: 2,
      })
      const { rows } = await pool().query(
        `select id, status from app_hidden.registrations_status_and_position
          where id = any($1)`,
        [registrations.map((r) => r.id)]
      )
      const queued = rows.find((r) => r.status === "IN_QUEUE")
      const inQuota = rows.find((r) => r.status === "IN_QUOTA")
      const tokenOf = (id: string) =>
        tokens[registrations.findIndex((r) => r.id === id)]

      await expectRefusal(tokenOf(queued.id), "IN_QUEUE")
      const result = await createCheckoutSession(tokenOf(inQuota.id))
      expect(result.errors).toBeFalsy()
    })

    it("PAYMENT_NOT_OPEN in after-registration mode while signup is open", async () => {
      const { tokens } = await createPaidEvent({
        paymentMode: "AFTER_REGISTRATION",
      })
      await expectRefusal(tokens[0], "PAYMENT_NOT_OPEN")
    })

    it("allows after-registration payment once signup has closed", async () => {
      const { tokens } = await createPaidEvent({
        paymentMode: "AFTER_REGISTRATION",
        signupClosed: true,
      })
      const result = await createCheckoutSession(tokens[0])
      expect(result.errors).toBeFalsy()
      expect(result.data!.createCheckoutSession.url).toBeTruthy()
    })
  })
})
