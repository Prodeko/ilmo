import refund from "../../src/tasks/payment__refund"
import {
  createPaidEvent,
  deleteTestData,
  disablePayments,
  enablePaymentsForEachTest,
  insertPayment,
  jobsOf,
  paymentById,
  runTask,
  stripeMock,
  testPool,
} from "../helpers"

jest.mock("stripe", () => require("../stripeMock").mockStripeModule())

enablePaymentsForEachTest()

beforeEach(async () => {
  await deleteTestData()
  jest.clearAllMocks()
  stripeMock().refunds.create.mockImplementation(async (params) => ({
    id: "re_test_1",
    object: "refund",
    amount: params.amount,
    status: "succeeded",
  }))
})

async function paidPayment(options = {}) {
  const { registrations } = await createPaidEvent()
  return insertPayment(registrations[0], { ...options })
}

describe("payment__refund", () => {
  it("refunds the ticket price only, keeping the service fee", async () => {
    const payment = await paidPayment()

    await runTask(refund, { paymentId: payment.id })

    const { create } = stripeMock().refunds
    expect(create).toHaveBeenCalledTimes(1)
    const [params, options] = create.mock.calls[0]
    expect(params).toEqual({
      payment_intent: payment.stripe_payment_intent_id,
      amount: 1800,
      metadata: {
        payment_id: payment.id,
        event_id: payment.event_id,
        quota_id: payment.quota_id,
        registration_id: payment.registration_id,
      },
    })
    expect(options).toEqual({ idempotencyKey: `refund-${payment.id}` })

    const updated = await paymentById(payment.id)
    expect(updated).toMatchObject({
      status: "REFUNDED",
      refunded_amount_cents: 1800,
      stripe_refund_id: "re_test_1",
    })
    expect(updated.refunded_at).toBeTruthy()

    expect(await jobsOf("payment__send_refund_email")).toEqual([
      { paymentId: payment.id, amountCents: 1800, full: false },
    ])
  })

  it("refunds the whole charge, service fee included, with full", async () => {
    const payment = await paidPayment()

    await runTask(refund, { paymentId: payment.id, full: true })

    const [params, options] = stripeMock().refunds.create.mock.calls[0]
    expect(params.amount).toEqual(1825)
    expect(options).toEqual({ idempotencyKey: `refund-${payment.id}` })
    expect((await paymentById(payment.id)).refunded_amount_cents).toEqual(1825)
    expect(await jobsOf("payment__send_refund_email")).toEqual([
      { paymentId: payment.id, amountCents: 1825, full: true },
    ])
  })

  it("refunds a payment whose registration was deleted", async () => {
    const { registrations } = await createPaidEvent()
    const payment = await insertPayment(registrations[0], { detached: true })

    await runTask(refund, { paymentId: payment.id })

    expect(stripeMock().refunds.create.mock.calls[0][0].amount).toEqual(1800)
    expect((await paymentById(payment.id)).status).toEqual("REFUNDED")
  })

  it("uses the same idempotency key when retried", async () => {
    const payment = await paidPayment()
    const { create } = stripeMock().refunds
    create.mockRejectedValueOnce(new Error("Stripe is down"))

    await expect(runTask(refund, { paymentId: payment.id })).rejects.toThrow(
      "Stripe is down"
    )
    // Nothing recorded, no email: graphile-worker retries the job
    expect((await paymentById(payment.id)).status).toEqual("PAID")
    expect(await jobsOf("payment__send_refund_email")).toEqual([])

    await runTask(refund, { paymentId: payment.id })
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls.map(([, options]) => options)).toEqual([
      { idempotencyKey: `refund-${payment.id}` },
      { idempotencyKey: `refund-${payment.id}` },
    ])
    expect((await paymentById(payment.id)).status).toEqual("REFUNDED")
    expect(await jobsOf("payment__send_refund_email")).toHaveLength(1)
  })

  it("fails on a failed Stripe refund so it is retried", async () => {
    const payment = await paidPayment()
    stripeMock().refunds.create.mockResolvedValueOnce({
      id: "re_failed",
      status: "failed",
    })

    await expect(runTask(refund, { paymentId: payment.id })).rejects.toThrow(
      /failed/
    )
    expect((await paymentById(payment.id)).status).toEqual("PAID")
  })

  it("doesn't refund twice", async () => {
    const payment = await paidPayment({ status: "REFUNDED" })

    await runTask(refund, { paymentId: payment.id })

    expect(stripeMock().refunds.create).not.toHaveBeenCalled()
    expect(await jobsOf("payment__send_refund_email")).toEqual([])
  })

  it.each([
    ["a manual payment", { method: "MANUAL" }],
    ["a pending payment", { status: "PENDING" }],
    ["an expired payment", { status: "EXPIRED" }],
  ])("doesn't refund %s", async (_name, options) => {
    const payment = await paidPayment(options)

    const { logger } = await runTask(refund, { paymentId: payment.id })

    expect(stripeMock().refunds.create).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalled()
    expect((await paymentById(payment.id)).status).toEqual(payment.status)
  })

  it("fails for a card payment without a payment intent, keeping the job visible", async () => {
    const payment = await paidPayment({ paymentIntentId: null })

    await expect(runTask(refund, { paymentId: payment.id })).rejects.toThrow(
      /no Stripe payment intent/
    )
    expect(stripeMock().refunds.create).not.toHaveBeenCalled()
    expect((await paymentById(payment.id)).status).toEqual("PAID")
  })

  it("refunds only what is left after a partial dashboard refund", async () => {
    const payment = await paidPayment()
    await testPool().query(
      "update app_public.payments set refunded_amount_cents = 500 where id = $1",
      [payment.id]
    )

    await runTask(refund, { paymentId: payment.id })

    // 500 of the 1800 ticket price is back already; the fee is still kept
    expect(stripeMock().refunds.create.mock.calls[0][0].amount).toEqual(1300)
    expect(await paymentById(payment.id)).toMatchObject({
      status: "REFUNDED",
      refunded_amount_cents: 1800,
      stripe_refund_id: "re_test_1",
    })
    expect(await jobsOf("payment__send_refund_email")).toEqual([
      { paymentId: payment.id, amountCents: 1300, full: false },
    ])
  })

  it("counts an earlier partial refund towards the ticket price", async () => {
    const payment = await paidPayment()
    await testPool().query(
      "update app_public.payments set refunded_amount_cents = 10 where id = $1",
      [payment.id]
    )

    await runTask(refund, { paymentId: payment.id })

    expect(stripeMock().refunds.create.mock.calls[0][0].amount).toEqual(1790)
    expect((await paymentById(payment.id)).refunded_amount_cents).toEqual(1800)
  })

  it("treats charge_already_refunded as done", async () => {
    const payment = await paidPayment()
    const error = Object.assign(
      new Error("Charge has already been refunded."),
      { code: "charge_already_refunded" }
    )
    stripeMock()
      .refunds.create.mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)

    await runTask(refund, { paymentId: payment.id })
    await runTask(refund, { paymentIntentId: "pi_done" })
    expect(stripeMock().refunds.create).toHaveBeenCalledTimes(2)

    expect((await paymentById(payment.id)).status).toEqual("PAID")
    expect(await jobsOf("payment__send_refund_email")).toEqual([])
  })

  it("calls nothing when the whole charge is already refunded", async () => {
    const payment = await paidPayment()
    await testPool().query(
      "update app_public.payments set refunded_amount_cents = 1825 where id = $1",
      [payment.id]
    )

    await runTask(refund, { paymentId: payment.id })

    expect(stripeMock().refunds.create).not.toHaveBeenCalled()
    expect(await jobsOf("payment__send_refund_email")).toEqual([])
  })

  it("refunds a payment intent that has no payment row in full", async () => {
    await runTask(refund, { paymentIntentId: "pi_orphan" })

    const { create } = stripeMock().refunds
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]).toEqual([
      { payment_intent: "pi_orphan" },
      { idempotencyKey: "refund-pi-pi_orphan" },
    ])
    expect(await jobsOf("payment__send_refund_email")).toEqual([])
  })

  it("doesn't fail for a payment that doesn't exist", async () => {
    await runTask(refund, {
      paymentId: "00000000-0000-0000-0000-000000000000",
    })
    expect(stripeMock().refunds.create).not.toHaveBeenCalled()
  })

  it("fails while payments are disabled, so the refund is retried later", async () => {
    const payment = await paidPayment()
    disablePayments()

    await expect(runTask(refund, { paymentId: payment.id })).rejects.toThrow(
      /disabled/
    )
    expect((await paymentById(payment.id)).status).toEqual("PAID")
  })
})
