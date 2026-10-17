import sendRefundEmail from "../../src/tasks/payment__send_refund_email"
import sendEmail from "../../src/tasks/send_email"
import {
  createPaidEvent,
  deleteTestData,
  disablePayments,
  enablePaymentsForEachTest,
  getEmails,
  insertPayment,
  jobsOf,
  runTask,
  sendQueuedEmails,
  stripeMock,
} from "../helpers"

jest.mock("stripe", () => require("../stripeMock").mockStripeModule())

enablePaymentsForEachTest()

beforeEach(async () => {
  await deleteTestData()
  jest.clearAllMocks()
})

describe("payment__send_refund_email", () => {
  it("tells the registration the ticket price was refunded and the fee kept", async () => {
    const { registrations } = await createPaidEvent()
    const payment = await insertPayment(registrations[0], {
      status: "REFUNDED",
    })

    await runTask(sendRefundEmail, {
      paymentId: payment.id,
      amountCents: 1800,
      full: false,
    })

    const [payload] = await jobsOf("send_email")
    expect(payload).toEqual({
      options: {
        to: registrations[0].email,
        subject: "Syyssitsit - Hyvitys / Refund",
      },
      template: "payment_refund.mjml.njk",
      variables: {
        url: process.env.ROOT_URL,
        eventName: { fi: "Syyssitsit", en: "Autumn sitsit" },
        paid: 1825,
        serviceFee: 25,
        refund: 1800,
        full: false,
      },
    })
    expect(stripeMock().checkout.sessions.retrieve).not.toHaveBeenCalled()

    await sendQueuedEmails(sendEmail)
    const { text } = JSON.parse(getEmails()[0].message)
    expect(text).toContain(
      "Ilmoittautumisesi tapahtumaan Syyssitsit on poistettu, ja maksusi on hyvitetty."
    )
    expect(text).toMatch(/^Maksettu\s+18,25 €$/m)
    expect(text).toMatch(/^Palvelumaksu \(ei hyvitetä\)\s+−0,25 €$/m)
    expect(text).toMatch(/^Hyvitys\s+18,00 €$/m)
    expect(text).toMatch(/^Service fee \(not refunded\)\s+−0,25 €$/m)
    expect(text).toMatch(/^Refund\s+18,00 €$/m)
  })

  it("emails the Checkout email when the registration is gone", async () => {
    const { registrations } = await createPaidEvent()
    const payment = await insertPayment(registrations[0], {
      status: "REFUNDED",
      detached: true,
    })
    stripeMock().checkout.sessions.retrieve.mockResolvedValue({
      id: payment.stripe_checkout_session_id,
      customer_email: null,
      customer_details: { email: "payer@example.com" },
    })

    await runTask(sendRefundEmail, { paymentId: payment.id, amountCents: 1800 })

    expect(stripeMock().checkout.sessions.retrieve).toHaveBeenCalledWith(
      payment.stripe_checkout_session_id
    )
    const [payload] = await jobsOf("send_email")
    expect(payload.options.to).toEqual("payer@example.com")
  })

  it("explains a duplicate payment refunded in full, without a fee row", async () => {
    const { registrations } = await createPaidEvent()
    const payment = await insertPayment(registrations[0], {
      status: "REFUNDED",
      detached: true,
    })
    stripeMock().checkout.sessions.retrieve.mockResolvedValue({
      customer_email: "payer@example.com",
      customer_details: null,
    })

    await runTask(sendRefundEmail, {
      paymentId: payment.id,
      amountCents: 1825,
      full: true,
    })

    const [payload] = await jobsOf("send_email")
    expect(payload.options.to).toEqual("payer@example.com")
    expect(payload.variables).toMatchObject({ paid: 1825, refund: 1825 })
    await sendQueuedEmails(sendEmail)
    const { text } = JSON.parse(getEmails()[0].message)
    expect(text).toContain("kahdesti")
    expect(text).toMatch(/^Hyvitys\s+18,25 €$/m)
    expect(text).not.toContain("Palvelumaksu")
    expect(text).not.toContain("Service fee")
  })

  it("defaults to the recorded refunded amount", async () => {
    const { registrations } = await createPaidEvent()
    const payment = await insertPayment(registrations[0], {
      status: "REFUNDED",
    })

    await runTask(sendRefundEmail, { paymentId: payment.id })

    const [payload] = await jobsOf("send_email")
    expect(payload.variables.refund).toEqual(payment.refunded_amount_cents)
  })

  it("logs and skips when there is no address", async () => {
    const { registrations } = await createPaidEvent()
    const payment = await insertPayment(registrations[0], {
      status: "REFUNDED",
      detached: true,
      sessionId: null,
    })

    const { logger } = await runTask(sendRefundEmail, {
      paymentId: payment.id,
    })

    expect(logger.error).toHaveBeenCalled()
    expect(await jobsOf("send_email")).toEqual([])
  })

  it("sends nothing while payments are disabled", async () => {
    const { registrations } = await createPaidEvent()
    const payment = await insertPayment(registrations[0], {
      status: "REFUNDED",
    })
    disablePayments()

    await runTask(sendRefundEmail, { paymentId: payment.id })

    expect(await jobsOf("send_email")).toEqual([])
  })
})
