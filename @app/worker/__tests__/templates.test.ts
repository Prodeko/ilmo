import sendEmail, { loadTemplate } from "../src/tasks/send_email"

import { getEmails, jobHelpers } from "./helpers"

/*
 * The registration emails of events without payments must render exactly as
 * they did before payments existed. These snapshots were recorded from the
 * templates as they were before the payment blocks were added, with the
 * variables the worker passes for an event without payments.
 */

const nonPaidVariables = {
  url: "http://localhost:5678",
  eventName: { fi: "Testitapahtuma", en: "Test event" },
  registrationName: "Teppo Testinen",
  registrationQuota: { fi: "Jäsenet", en: "Members" },
  eventTime: "31.10.26 18:00 - 1.11.26 02:00",
  eventSlug: "2026-10-31-testitapahtuma",
  eventLocation: "Dipoli, Otakaari 24",
  eventRegistrationUpdateLink: "update-registration/0123456789abcdef",
}

async function render(template: string, variables: Record<string, unknown>) {
  const templateFn = await loadTemplate(template)
  return (await templateFn(variables)) as string
}

describe("emails of events without payments", () => {
  it.each(["event_registration.mjml.njk", "spot_from_queue.mjml.njk"])(
    "%s renders as before payments",
    async (template) => {
      expect(await render(template, nonPaidVariables)).toMatchSnapshot()
    }
  )
})

/*
 * Plain text of the payment emails (boards 12–15), as sent. Amounts are
 * cents, formatted by the `euro` filter.
 */
const paymentVariables = {
  ...nonPaidVariables,
  firstName: "Teppo",
  price: 1800,
  serviceFee: 25,
  total: 1825,
}

async function sentText(template: string, variables: Record<string, unknown>) {
  await sendEmail(
    { options: { to: "a@b.c", subject: "Test" }, template, variables },
    jobHelpers()
  )
  const emails = getEmails()
  return JSON.parse(emails[emails.length - 1].message).text as string
}

describe("payment emails", () => {
  it.each([
    [
      "confirmation, pay during registration",
      "event_registration.mjml.njk",
      {
        paymentMode: "DURING_REGISTRATION",
        isQueued: false,
        isPaid: false,
        payLink: "pay/0123456789abcdef",
      },
    ],
    [
      "confirmation, pay after registration closes",
      "event_registration.mjml.njk",
      {
        paymentMode: "AFTER_REGISTRATION",
        isQueued: false,
        isPaid: false,
        registrationEndDate: "24.10.2026",
        registrationEndTime: "12:00",
      },
    ],
    [
      "confirmation, already paid",
      "event_registration.mjml.njk",
      { paymentMode: "DURING_REGISTRATION", isQueued: false, isPaid: true },
    ],
    [
      "spot from queue with payment link",
      "spot_from_queue.mjml.njk",
      { paymentMode: "DURING_REGISTRATION", payLink: "pay/0123456789abcdef" },
    ],
    [
      "payment reminder",
      "payment_reminder.mjml.njk",
      { payLink: "pay/0123456789abcdef", closed: false },
    ],
    [
      "registration closed reminder",
      "payment_reminder.mjml.njk",
      { payLink: "pay/0123456789abcdef", closed: true },
    ],
    [
      "payment received by card",
      "payment_received.mjml.njk",
      { paidAt: "17.10.2026 14:32", paymentMethod: "STRIPE" },
    ],
    [
      "payment received by hand",
      "payment_received.mjml.njk",
      {
        serviceFee: 0,
        total: 1800,
        paidAt: "17.10.2026 14:32",
        paymentMethod: "MANUAL",
      },
    ],
    [
      "refund of the ticket price",
      "payment_refund.mjml.njk",
      { paid: 1825, refund: 1800, full: false },
    ],
    [
      "full refund of a duplicate payment",
      "payment_refund.mjml.njk",
      { paid: 1825, refund: 1825, full: true },
    ],
  ])("%s", async (_name, template, variables) => {
    expect(
      await sentText(template, { ...paymentVariables, ...variables })
    ).toMatchSnapshot()
  })

  it("a queued registration's confirmation has no payment section", async () => {
    const queued = await render("event_registration.mjml.njk", {
      ...paymentVariables,
      paymentMode: "DURING_REGISTRATION",
      isQueued: true,
      isPaid: false,
    })
    expect(queued).toEqual(
      await render("event_registration.mjml.njk", nonPaidVariables)
    )
  })
})
