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
} from "../payments"

jest.mock("stripe", () => require("../stripeMock").mockStripeModule())

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)
enablePaymentsForEachTest()

const pool = () => poolFromUrl(TEST_DATABASE_URL)

const PaymentByUpdateTokenQuery = `
  query PaymentByUpdateToken($updateToken: String!) {
    paymentByUpdateToken(updateToken: $updateToken) {
      eventId
      eventSlug
      eventName
      eventStartTime
      eventEndTime
      registrationEndTime
      paymentMode
      quotaTitle
      firstName
      lastName
      queueStatus
      queuePosition
      status
      priceCents
      serviceFeeCents
      totalCents
      paidManually
      paidTotalCents
      paidAt
      refundedAmountCents
      refundedAt
      blockedReason
    }
  }
`

async function paymentByUpdateToken(updateToken: string) {
  const result = await runGraphQLQuery(
    PaymentByUpdateTokenQuery,
    { updateToken },
    {},
    () => {},
    true,
    false
  )
  expect(result.errors).toBeFalsy()
  return result.data!.paymentByUpdateToken
}

describe("paymentByUpdateToken", () => {
  it("describes an unpaid registration", async () => {
    const { event, registrations, tokens } = await createPaidEvent()
    const [registration] = registrations

    expect(await paymentByUpdateToken(tokens[0])).toEqual({
      eventId: event.id,
      eventSlug: event.slug,
      eventName: event.name,
      eventStartTime: new Date(event.event_start_time).toISOString(),
      eventEndTime: new Date(event.event_end_time).toISOString(),
      registrationEndTime: new Date(event.registration_end_time).toISOString(),
      paymentMode: "DURING_REGISTRATION",
      quotaTitle: { fi: "Kiintiö 0", en: "Quota 0" },
      firstName: registration.first_name,
      lastName: registration.last_name,
      queueStatus: "IN_QUOTA",
      queuePosition: 1,
      status: "UNPAID",
      priceCents: 1800,
      serviceFeeCents: 25,
      totalCents: 1825,
      paidManually: false,
      paidTotalCents: null,
      paidAt: null,
      refundedAmountCents: null,
      refundedAt: null,
      blockedReason: null,
    })
  })

  it("shows a card payment", async () => {
    const { registrations, tokens } = await createPaidEvent()
    const payment = await insertPayment(pool(), registrations[0])

    expect(await paymentByUpdateToken(tokens[0])).toMatchObject({
      status: "PAID",
      paidManually: false,
      paidTotalCents: 1825,
      paidAt: payment.paid_at.toISOString(),
      blockedReason: "ALREADY_PAID",
    })
  })

  it("shows a manual payment", async () => {
    const { registrations, tokens } = await createPaidEvent()
    await insertPayment(pool(), registrations[0], { method: "MANUAL" })

    expect(await paymentByUpdateToken(tokens[0])).toMatchObject({
      status: "PAID_MANUALLY",
      paidManually: true,
      paidTotalCents: 1800,
      blockedReason: "ALREADY_PAID",
    })
  })

  it("shows a refund", async () => {
    const { registrations, tokens } = await createPaidEvent()
    const payment = await insertPayment(pool(), registrations[0])
    await pool().query(
      `update app_public.payments
        set status = 'REFUNDED', refunded_amount_cents = 1800, refunded_at = now()
        where id = $1`,
      [payment.id]
    )

    expect(await paymentByUpdateToken(tokens[0])).toMatchObject({
      status: "REFUNDED",
      refundedAmountCents: 1800,
      refundedAt: expect.any(String),
      blockedReason: "PAYMENT_REFUNDED",
    })
  })

  it("shows a free registration with zero amounts", async () => {
    const { tokens } = await createPaidEvent({ priceCents: 0 })

    expect(await paymentByUpdateToken(tokens[0])).toMatchObject({
      status: "NOT_REQUIRED",
      priceCents: 0,
      serviceFeeCents: 0,
      totalCents: 0,
      blockedReason: "PAYMENT_NOT_REQUIRED",
    })
  })

  it("shows that payment opens when registration closes", async () => {
    const { tokens } = await createPaidEvent({
      paymentMode: "AFTER_REGISTRATION",
    })

    expect(await paymentByUpdateToken(tokens[0])).toMatchObject({
      paymentMode: "AFTER_REGISTRATION",
      status: "UNPAID",
      blockedReason: "PAYMENT_NOT_OPEN",
    })
  })

  it("shows the queue position", async () => {
    const { registrations, tokens } = await createPaidEvent({
      quotaSize: 1,
      registrationCount: 3,
    })
    const { rows } = await pool().query(
      `select id, status, position from app_hidden.registrations_status_and_position
        where id = any($1) and status = 'IN_QUEUE' order by position`,
      [registrations.map((r) => r.id)]
    )
    const last = rows[rows.length - 1]
    const token = tokens[registrations.findIndex((r) => r.id === last.id)]

    expect(await paymentByUpdateToken(token)).toMatchObject({
      queueStatus: "IN_QUEUE",
      queuePosition: 2,
      status: "UNPAID",
      blockedReason: "IN_QUEUE",
    })
  })

  it("is null for an unknown token", async () => {
    await createPaidEvent()
    expect(await paymentByUpdateToken("not-a-token")).toBeNull()
  })

  it("is null while payments are disabled", async () => {
    const { tokens } = await createPaidEvent()
    disablePayments()
    expect(await paymentByUpdateToken(tokens[0])).toBeNull()
  })
})
