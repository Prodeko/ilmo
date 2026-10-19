import * as registrationPayment from "../../src/payments/registrationPayment"
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

type PaidEventOptions = Parameters<typeof createPaidEvent>[0]
type PaidEvent = Awaited<ReturnType<typeof createPaidEvent>>

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
      paidTicketCents
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
      paidTicketCents: null,
      paidAt: null,
      refundedAmountCents: null,
      refundedAt: null,
      blockedReason: null,
    })
  })

  it.each<
    [
      string,
      PaidEventOptions,
      (
        data: PaidEvent
      ) => Promise<{ token: string; expected: Record<string, unknown> }>,
    ]
  >([
    [
      "a card payment",
      {},
      async ({ registrations, tokens }) => {
        const payment = await insertPayment(pool(), registrations[0])
        return {
          token: tokens[0],
          expected: {
            status: "PAID",
            paidManually: false,
            paidTotalCents: 1825,
            paidTicketCents: 1800,
            paidAt: payment.paid_at.toISOString(),
            blockedReason: "ALREADY_PAID",
          },
        }
      },
    ],
    [
      "a manual payment",
      {},
      async ({ registrations, tokens }) => {
        await insertPayment(pool(), registrations[0], { method: "MANUAL" })
        return {
          token: tokens[0],
          expected: {
            status: "PAID_MANUALLY",
            paidManually: true,
            paidTotalCents: 1800,
            blockedReason: "ALREADY_PAID",
          },
        }
      },
    ],
    [
      "a refund",
      {},
      async ({ registrations, tokens }) => {
        const payment = await insertPayment(pool(), registrations[0])
        await pool().query(
          `update app_public.payments
            set status = 'REFUNDED', refunded_amount_cents = 1800, refunded_at = now()
            where id = $1`,
          [payment.id]
        )
        return {
          token: tokens[0],
          expected: {
            status: "REFUNDED",
            refundedAmountCents: 1800,
            refundedAt: expect.any(String),
            blockedReason: "PAYMENT_REFUNDED",
          },
        }
      },
    ],
    [
      "a free registration with zero amounts",
      { priceCents: 0 },
      async ({ tokens }) => ({
        token: tokens[0],
        expected: {
          status: "NOT_REQUIRED",
          priceCents: 0,
          serviceFeeCents: 0,
          totalCents: 0,
          blockedReason: "PAYMENT_NOT_REQUIRED",
        },
      }),
    ],
    [
      "that payment opens when registration closes",
      { paymentMode: "AFTER_REGISTRATION" },
      async ({ tokens }) => ({
        token: tokens[0],
        expected: {
          paymentMode: "AFTER_REGISTRATION",
          status: "UNPAID",
          blockedReason: "PAYMENT_NOT_OPEN",
        },
      }),
    ],
    [
      "the queue position",
      { quotaSize: 1, registrationCount: 3 },
      async ({ registrations, tokens }) => {
        const { rows } = await pool().query(
          `select id, status, position from app_hidden.registrations_status_and_position
            where id = any($1) and status = 'IN_QUEUE' order by position`,
          [registrations.map((r) => r.id)]
        )
        const last = rows[rows.length - 1]
        return {
          token: tokens[registrations.findIndex((r) => r.id === last.id)],
          expected: {
            queueStatus: "IN_QUEUE",
            queuePosition: 2,
            status: "UNPAID",
            blockedReason: "IN_QUEUE",
          },
        }
      },
    ],
  ])("shows %s", async (_name, options, arrange) => {
    const { token, expected } = await arrange(await createPaidEvent(options))
    expect(await paymentByUpdateToken(token)).toMatchObject(expected)
  })

  it("hides database error text behind PAYMENT_LOOKUP_FAILED", async () => {
    const { tokens } = await createPaidEvent()
    const spy = jest
      .spyOn(registrationPayment, "loadSettledPayment")
      .mockRejectedValueOnce(
        new Error('relation "app_private.secret_table" does not exist')
      )
    try {
      const result = await runGraphQLQuery(
        PaymentByUpdateTokenQuery,
        { updateToken: tokens[0] },
        {},
        () => {},
        true,
        false
      )
      expect(result.errors).toHaveLength(1)
      const [error] = result.errors!
      expect(error.extensions!.exception).toMatchObject({
        code: "PAYMENT_LOOKUP_FAILED",
      })
      expect(JSON.stringify(error)).not.toMatch(/secret_table/)
    } finally {
      spy.mockRestore()
    }
  })

  it.each<[string, (data: PaidEvent) => string]>([
    ["for an unknown token", () => "not-a-token"],
    [
      "while payments are disabled",
      ({ tokens }) => {
        disablePayments()
        return tokens[0]
      },
    ],
  ])("is null %s", async (_name, tokenOf) => {
    const token = tokenOf(await createPaidEvent())
    expect(await paymentByUpdateToken(token)).toBeNull()
  })
})
