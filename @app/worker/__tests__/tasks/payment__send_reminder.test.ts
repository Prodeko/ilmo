import sendReceivedEmail from "../../src/tasks/payment__send_received_email"
import sendReminder from "../../src/tasks/payment__send_reminder"
import sendEmail from "../../src/tasks/send_email"
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

async function firstRegistration(
  options: Parameters<typeof createPaidEvent>[0] = {}
) {
  const { registrations } = await createPaidEvent(options)
  return registrations[0]
}

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

  it("charges the quota's current price", async () => {
    const { quota, registrations } = await createPaidEvent()
    await testPool().query(
      "update app_public.quotas set price_cents = 2200 where id = $1",
      [quota.id]
    )

    await runTask(sendReminder, { registrationId: registrations[0].id })

    const [payload] = await jobsOf("send_email")
    expect(payload.variables).toMatchObject({ price: 2200, total: 2225 })
  })

  it("says that registration has closed in the close email", async () => {
    const { registrations } = await createPaidEvent({ signupClosed: true })

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
    ["paid by card", { method: "STRIPE" as const }, 0],
    ["paid by hand", { method: "MANUAL" as const }, 0],
    ["whose payment attempt expired", { status: "EXPIRED" as const }, 1],
  ])(
    "a registration %s in the meantime gets %i reminders",
    async (_name, options, reminders) => {
      const registration = await firstRegistration()
      await insertPayment(registration, options)

      await runTask(sendReminder, { registrationId: registration.id })

      expect(await jobsOf("send_email")).toHaveLength(reminders)
    }
  )

  it("skips a queued registration", async () => {
    const { registrations } = await createPaidEvent({
      quotaSize: 1,
      registrationCount: 2,
    })

    await runTask(sendReminder, { registrationId: registrations[1].id })

    expect(await jobsOf("send_email")).toEqual([])
  })

  it.each([
    [
      "a free quota",
      async () => (await firstRegistration({ priceCents: 0 })).id,
    ],
    [
      "a quota made free in the meantime",
      async () => {
        const { quota, registrations } = await createPaidEvent()
        await testPool().query(
          "update app_public.quotas set price_cents = 0 where id = $1",
          [quota.id]
        )
        return registrations[0].id
      },
    ],
    [
      "a deleted registration",
      async () => "00000000-0000-0000-0000-000000000000",
    ],
  ])("skips %s", async (_name, registrationId) => {
    await runTask(sendReminder, { registrationId: await registrationId() })

    expect(await jobsOf("send_email")).toEqual([])
  })
})

// A flag closes the ways in, never the ways out: reminders stop while the
// `payments` flag is off, emails about payments already made still go out.
describe("payment emails while the payments flag is off", () => {
  it("payment__send_reminder sends nothing", async () => {
    const registration = await firstRegistration()
    await setFeatureFlag(testPool(), "payments", "off")

    await runTask(sendReminder, { registrationId: registration.id })

    expect(await jobsOf("send_email")).toEqual([])
  })

  it("payment__send_received_email still sends", async () => {
    const payment = await insertPayment(await firstRegistration())
    await setFeatureFlag(testPool(), "payments", "off")

    await runTask(sendReceivedEmail, { paymentId: payment.id })

    expect(await jobsOf("send_email")).toHaveLength(1)
  })
})
