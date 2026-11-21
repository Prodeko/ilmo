import sendConfirmationEmail from "../../src/tasks/registration__send_confirmation_email"
import sendEmail, { loadTemplate } from "../../src/tasks/send_email"
import {
  createPaidEvent,
  deleteTestData,
  getEmails,
  insertPayment,
  jobsOf,
  runTask,
  sendQueuedEmails,
  setFeatureFlag,
  testPool,
} from "../helpers"

beforeEach(deleteTestData)
beforeEach(() => setFeatureFlag(testPool(), "payments", "on"))

// The variables the task sent before payments existed
const NON_PAID_VARIABLE_KEYS = [
  "eventLocation",
  "eventName",
  "eventRegistrationUpdateLink",
  "eventSlug",
  "eventTime",
  "isWaitlisted",
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
  it("promises the payment link at the close of registration", async () => {
    const { event, registrations } = await createPaidEvent()

    const payload = await confirmationPayload(registrations[0].id)

    expect(payload.variables).toMatchObject({
      price: 1800,
      serviceFee: 25,
      total: 1825,
      isQueued: false,
    })
    expect(payload.variables.payLink).toBeUndefined()
    await sendQueuedEmails(sendEmail)
    const { text } = JSON.parse(getEmails()[0].message)
    expect(text).toContain("Maksu: maksulinkki tulee myöhemmin")
    expect(text).toContain("Lippu 18,00 € + palvelumaksu 0,25 € = 18,25 €")
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

  it("asks for payment when sent after registration has closed", async () => {
    const { registrations, tokens } = await createPaidEvent({
      signupClosed: true,
    })

    const payload = await confirmationPayload(registrations[0].id)

    expect(payload.variables).toMatchObject({ payLink: `pay/${tokens[0]}` })
    await sendQueuedEmails(sendEmail)
    const { text } = JSON.parse(getEmails()[0].message)
    expect(text).toContain("Maksu: odottaa maksua")
    expect(text).toContain(
      `Maksa 18,25 € [${process.env.ROOT_URL}/fi/pay/${tokens[0]}]`
    )
    expect(text).toContain("Payment: pending")
  })

  it("has no payment link once the registration is paid", async () => {
    const { registrations } = await createPaidEvent({ signupClosed: true })
    await insertPayment(registrations[0])

    const payload = await confirmationPayload(registrations[0].id)

    expect(payload.variables.payLink).toBeUndefined()
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
    ["a free quota", { priceCents: 0 }, false],
    ["a paid event while the payments flag is off", {}, true],
  ])(
    "sends exactly the variables of before for %s",
    async (_name, options, disable) => {
      const { registrations } = await createPaidEvent(options)
      if (disable) await setFeatureFlag(testPool(), "payments", "off")

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
