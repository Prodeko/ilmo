import sendConfirmationEmail from "../../src/tasks/registration__send_confirmation_email"
import sendEmail, { loadTemplate } from "../../src/tasks/send_email"
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

// The variables the task sent before payments existed
const NON_PAID_VARIABLE_KEYS = [
  "eventLocation",
  "eventName",
  "eventRegistrationUpdateLink",
  "eventSlug",
  "eventTime",
  "registrationName",
  "registrationQuota",
  "url",
]

async function confirmationPayload(registrationId: string) {
  await runTask(sendConfirmationEmail, { id: registrationId })
  const [payload] = await jobsOf("send_email")
  return payload
}

describe("registration__send_confirmation_email", () => {
  it("asks for payment in DURING_REGISTRATION mode", async () => {
    const { registrations, tokens } = await createPaidEvent()

    const payload = await confirmationPayload(registrations[0].id)

    expect(payload.variables).toMatchObject({
      price: 1800,
      serviceFee: 25,
      total: 1825,
      paymentMode: "DURING_REGISTRATION",
      isQueued: false,
      isPaid: false,
      payLink: `pay/${tokens[0]}`,
    })
    await sendQueuedEmails(sendEmail)
    const { text } = JSON.parse(getEmails()[0].message)
    expect(text).toContain("Maksu: odottaa maksua")
    expect(text).toContain("Lippu 18,00 € + palvelumaksu 0,25 € = 18,25 €")
    expect(text).toContain(
      `Maksa 18,25 € [${process.env.ROOT_URL}/fi/pay/${tokens[0]}]`
    )
    expect(text).toContain("Payment: pending")
  })

  it("promises the link at close in AFTER_REGISTRATION mode", async () => {
    const { event, registrations } = await createPaidEvent({
      paymentMode: "AFTER_REGISTRATION",
    })

    const payload = await confirmationPayload(registrations[0].id)

    expect(payload.variables).toMatchObject({
      price: 1800,
      paymentMode: "AFTER_REGISTRATION",
      isQueued: false,
    })
    expect(payload.variables.payLink).toBeUndefined()
    await sendQueuedEmails(sendEmail)
    const { text } = JSON.parse(getEmails()[0].message)
    expect(text).toContain("Maksu: maksulinkki tulee myöhemmin")
    expect(text).toContain("Payment: link coming later")
    expect(text).toContain(
      `kun ilmoittautuminen sulkeutuu ${payload.variables.registrationEndDate} klo ${payload.variables.registrationEndTime}.`
    )
    expect(payload.variables.registrationEndDate).toMatch(/^\d+\.\d+\.\d{4}$/)
    expect(new Date(event.registration_end_time).getFullYear()).toEqual(
      Number(payload.variables.registrationEndDate.split(".")[2])
    )
    expect(text).not.toContain("/pay/")
  })

  it("says paid when the registration is already paid", async () => {
    const { registrations } = await createPaidEvent()
    await insertPayment(registrations[0])

    const payload = await confirmationPayload(registrations[0].id)

    expect(payload.variables).toMatchObject({ isPaid: true })
    expect(payload.variables.payLink).toBeUndefined()
    await sendQueuedEmails(sendEmail)
    const { text } = JSON.parse(getEmails()[0].message)
    expect(text).toContain("Maksu: maksettu")
    expect(text).not.toContain("/pay/")
  })

  it("has no payment section for a queued registration", async () => {
    const { registrations } = await createPaidEvent({
      quotaSize: 1,
      registrationCount: 2,
    })

    const payload = await confirmationPayload(registrations[1].id)

    expect(payload.variables).toMatchObject({ isQueued: true })
    expect(payload.variables.payLink).toBeUndefined()
    await sendQueuedEmails(sendEmail)
    const { text } = JSON.parse(getEmails()[0].message)
    expect(text).not.toContain("Maksu")
    expect(text).not.toContain("Payment")

    // Renders exactly like the email of an event without payments
    const render = await loadTemplate("event_registration.mjml.njk")
    const nonPaidVariables = Object.fromEntries(
      NON_PAID_VARIABLE_KEYS.map((key) => [key, payload.variables[key]])
    )
    expect(await render(payload.variables)).toEqual(
      await render(nonPaidVariables)
    )
  })

  it.each([
    ["an event without payments", { paymentMode: "NONE" as const }, false],
    ["a free quota", { priceCents: 0 }, false],
    ["a paid event while payments are disabled", {}, true],
  ])(
    "sends exactly the variables of before for %s",
    async (_name, options, disable) => {
      const { registrations } = await createPaidEvent(options)
      if (disable) disablePayments()

      const payload = await confirmationPayload(registrations[0].id)

      expect(Object.keys(payload.variables).sort()).toEqual(
        NON_PAID_VARIABLE_KEYS
      )
      await sendQueuedEmails(sendEmail)
      const { text } = JSON.parse(getEmails()[0].message)
      expect(text).not.toContain("Maksu")
      expect(text).not.toContain("Payment")
    }
  )
})
