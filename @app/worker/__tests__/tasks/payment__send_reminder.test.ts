import sendReminder from "../../src/tasks/payment__send_reminder"
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
} from "../helpers"

jest.mock("stripe", () => require("../stripeMock").mockStripeModule())

enablePaymentsForEachTest()

beforeEach(deleteTestData)

describe("payment__send_reminder", () => {
  it("emails the payment link to an unpaid registration", async () => {
    const { event, quota, registrations, tokens } = await createPaidEvent()
    const [registration] = registrations

    await runTask(sendReminder, { registrationId: registration.id })

    const [payload] = await jobsOf("send_email")
    expect(payload).toEqual({
      options: {
        to: registration.email,
        subject: `${event.name.fi} - Maksumuistutus / Payment reminder`,
      },
      template: "payment_reminder.mjml.njk",
      variables: {
        url: process.env.ROOT_URL,
        eventName: event.name,
        firstName: registration.first_name,
        registrationQuota: quota.title,
        price: 1800,
        serviceFee: 25,
        total: 1825,
        payLink: `pay/${tokens[0]}`,
        closed: false,
      },
    })

    await sendQueuedEmails(sendEmail)
    const [email] = getEmails()
    const { text } = JSON.parse(email.message)
    expect(text).toContain(`Hei ${registration.first_name},`)
    expect(text).toContain("Lippu 18,00 € + palvelumaksu 0,25 € = 18,25 €")
    expect(text).toContain(
      `Maksa 18,25 € [${process.env.ROOT_URL}/fi/pay/${tokens[0]}]`
    )
    expect(text).toContain(
      `Pay 18,25 € [${process.env.ROOT_URL}/en/pay/${tokens[0]}]`
    )
    expect(text).not.toContain("Ilmoittautuminen on päättynyt")
  })

  it("says that registration has closed in the close email", async () => {
    const { registrations } = await createPaidEvent({
      paymentMode: "AFTER_REGISTRATION",
      signupClosed: true,
    })

    await runTask(sendReminder, {
      registrationId: registrations[0].id,
      closed: true,
    })

    const [payload] = await jobsOf("send_email")
    expect(payload.variables.closed).toBe(true)
    await sendQueuedEmails(sendEmail)
    const { text } = JSON.parse(getEmails()[0].message)
    expect(text).toMatch(/^Ilmoittautuminen on päättynyt\./m)
    expect(text).toMatch(/^Registration has closed\./m)
  })

  it.each([
    ["by card", { method: "STRIPE" as const }],
    ["by hand", { method: "MANUAL" as const }],
    ["and refunded", { status: "REFUNDED" as const }],
  ])("skips a registration paid %s in the meantime", async (_name, options) => {
    const { registrations } = await createPaidEvent()
    await insertPayment(registrations[0], options)

    await runTask(sendReminder, { registrationId: registrations[0].id })

    expect(await jobsOf("send_email")).toEqual([])
  })

  it("reminds a registration whose earlier payment attempt expired", async () => {
    const { registrations } = await createPaidEvent()
    await insertPayment(registrations[0], { status: "EXPIRED" })

    await runTask(sendReminder, { registrationId: registrations[0].id })

    expect(await jobsOf("send_email")).toHaveLength(1)
  })

  it("skips a queued registration", async () => {
    const { registrations } = await createPaidEvent({
      quotaSize: 1,
      registrationCount: 2,
    })

    await runTask(sendReminder, { registrationId: registrations[1].id })

    expect(await jobsOf("send_email")).toEqual([])
  })

  it("skips free quotas and events without payments", async () => {
    const free = await createPaidEvent({ priceCents: 0 })
    const none = await createPaidEvent({ paymentMode: "NONE" })

    await runTask(sendReminder, { registrationId: free.registrations[0].id })
    await runTask(sendReminder, { registrationId: none.registrations[0].id })

    expect(await jobsOf("send_email")).toEqual([])
  })

  it("skips a deleted registration", async () => {
    await runTask(sendReminder, {
      registrationId: "00000000-0000-0000-0000-000000000000",
    })
    expect(await jobsOf("send_email")).toEqual([])
  })

  it("sends nothing while payments are disabled", async () => {
    const { registrations } = await createPaidEvent()
    disablePayments()

    await runTask(sendReminder, { registrationId: registrations[0].id })

    expect(await jobsOf("send_email")).toEqual([])
  })
})
