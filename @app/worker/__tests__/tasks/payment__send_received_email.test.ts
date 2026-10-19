import dayjs from "dayjs"

import sendReceivedEmail from "../../src/tasks/payment__send_received_email"
import sendEmail from "../../src/tasks/send_email"
import {
  createPaidEvent,
  deleteTestData,
  enablePaymentsForEachTest,
  getEmails,
  insertPayment,
  jobsOf,
  runTask,
  sendQueuedEmails,
  testPool,
} from "../helpers"

jest.mock("stripe", () => require("../stripeMock").mockStripeModule())

enablePaymentsForEachTest()

beforeEach(deleteTestData)

describe("payment__send_received_email", () => {
  it("confirms a card payment with the service fee", async () => {
    const { event, quota, registrations, tokens } = await createPaidEvent()
    const [registration] = registrations
    const payment = await insertPayment(registration)

    await runTask(sendReceivedEmail, { paymentId: payment.id })

    const [payload] = await jobsOf("send_email")
    expect(payload.options).toEqual({
      to: registration.email,
      subject: `${event.name.fi} - Maksu vastaanotettu / Payment received`,
    })
    expect(payload.template).toEqual("payment_received.mjml.njk")
    const paidAt = dayjs(payment.paid_at).format("D.M.YYYY HH:mm")
    expect(payload.variables).toMatchObject({
      eventName: event.name,
      registrationName: `${registration.first_name} ${registration.last_name}`,
      registrationQuota: quota.title,
      eventRegistrationUpdateLink: `update-registration/${tokens[0]}`,
      price: 1800,
      serviceFee: 25,
      total: 1825,
      paidAt,
      paymentMethod: "STRIPE",
    })

    await sendQueuedEmails(sendEmail)
    const { text } = JSON.parse(getEmails()[0].message)
    expect(text).toMatch(/^Lippu\s+18,00 €$/m)
    expect(text).toMatch(/^Palvelumaksu\s+0,25 €$/m)
    expect(text).toMatch(/^Yhteensä\s+18,25 €$/m)
    expect(text).toMatch(new RegExp(`^Maksettu\\s+${paidAt}$`, "m"))
    expect(text).toMatch(/^Service fee\s+0,25 €$/m)
    expect(text).toMatch(/^Total\s+18,25 €$/m)
  })

  it("leaves the service fee out for a manual payment", async () => {
    const { registrations } = await createPaidEvent()
    const payment = await insertPayment(registrations[0], { method: "MANUAL" })

    await runTask(sendReceivedEmail, { paymentId: payment.id })

    const [payload] = await jobsOf("send_email")
    expect(payload.variables).toMatchObject({
      price: 1800,
      serviceFee: 0,
      total: 1800,
      paymentMethod: "MANUAL",
    })
    await sendQueuedEmails(sendEmail)
    const { text } = JSON.parse(getEmails()[0].message)
    expect(text).not.toContain("Palvelumaksu")
    expect(text).not.toContain("Service fee")
    expect(text).toMatch(/^Yhteensä\s+18,00 €$/m)
  })

  it.each([
    [
      "deleted (undone) before the job ran",
      async (registration) => {
        const payment = await insertPayment(registration, { method: "MANUAL" })
        await testPool().query(
          "delete from app_public.payments where id = $1",
          [payment.id]
        )
        return payment
      },
    ],
    [
      "that was refunded",
      (registration) => insertPayment(registration, { status: "REFUNDED" }),
    ],
    [
      "without a registration",
      (registration) => insertPayment(registration, { detached: true }),
    ],
  ])("skips a payment %s", async (_name, createPayment) => {
    const { registrations } = await createPaidEvent()
    const payment = await createPayment(registrations[0])

    await runTask(sendReceivedEmail, { paymentId: payment.id })

    expect(await jobsOf("send_email")).toEqual([])
  })
})
