import sendUnpaidOnClose from "../../src/tasks/event__send_unpaid_on_close"
import {
  createPaidEvent,
  deleteTestData,
  disablePayments,
  enablePaymentsForEachTest,
  insertPayment,
  jobsOf,
  runTask,
  testPool,
} from "../helpers"

jest.mock("stripe", () => require("../stripeMock").mockStripeModule())

enablePaymentsForEachTest()

beforeEach(deleteTestData)

async function closeEmailSentAt(eventId: string) {
  const {
    rows: [event],
  } = await testPool().query(
    "select unpaid_close_email_sent_at from app_public.events where id = $1",
    [eventId]
  )
  return event.unpaid_close_email_sent_at
}

describe("event__send_unpaid_on_close", () => {
  it("reminds every unpaid registration holding a spot, once", async () => {
    // Four registrations, three spots: [paid, unpaid, unpaid, queued]
    const { event, registrations } = await createPaidEvent({
      paymentMode: "AFTER_REGISTRATION",
      quotaSize: 3,
      registrationCount: 4,
      signupClosed: true,
    })
    await insertPayment(registrations[0])

    await runTask(sendUnpaidOnClose, {})

    expect(await jobsOf("payment__send_reminder")).toEqual([
      { registrationId: registrations[1].id, closed: true },
      { registrationId: registrations[2].id, closed: true },
    ])
    expect(await closeEmailSentAt(event.id)).toBeTruthy()

    // The next run (a minute later) finds nothing to do
    await runTask(sendUnpaidOnClose, {})
    expect(await jobsOf("payment__send_reminder")).toHaveLength(2)
  })

  it("runs in DURING_REGISTRATION mode when the close email is on", async () => {
    const { event, registrations } = await createPaidEvent({
      paymentMode: "DURING_REGISTRATION",
      sendUnpaidEmailOnClose: true,
      signupClosed: true,
    })

    await runTask(sendUnpaidOnClose, {})

    expect(await jobsOf("payment__send_reminder")).toEqual([
      { registrationId: registrations[0].id, closed: true },
    ])
    expect(await closeEmailSentAt(event.id)).toBeTruthy()
  })

  it("marks an event without unpaid registrations as done", async () => {
    const { event, registrations } = await createPaidEvent({
      paymentMode: "AFTER_REGISTRATION",
      signupClosed: true,
    })
    await insertPayment(registrations[0], { method: "MANUAL" })

    await runTask(sendUnpaidOnClose, {})

    expect(await jobsOf("payment__send_reminder")).toEqual([])
    expect(await closeEmailSentAt(event.id)).toBeTruthy()
  })

  it.each([
    ["registration is still open", { paymentMode: "AFTER_REGISTRATION" }],
    [
      "the close email is off",
      { paymentMode: "DURING_REGISTRATION", signupClosed: true },
    ],
    [
      "the event has no payments",
      {
        paymentMode: "NONE",
        sendUnpaidEmailOnClose: true,
        signupClosed: true,
      },
    ],
  ] as const)("skips an event when %s", async (_name, options) => {
    const { event } = await createPaidEvent(options)

    await runTask(sendUnpaidOnClose, {})

    expect(await jobsOf("payment__send_reminder")).toEqual([])
    expect(await closeEmailSentAt(event.id)).toBeNull()
  })

  it("skips an event whose close email was already sent", async () => {
    const { event } = await createPaidEvent({
      paymentMode: "AFTER_REGISTRATION",
      signupClosed: true,
    })
    await testPool().query(
      "update app_public.events set unpaid_close_email_sent_at = now() - interval '1 day' where id = $1",
      [event.id]
    )

    await runTask(sendUnpaidOnClose, {})

    expect(await jobsOf("payment__send_reminder")).toEqual([])
  })

  it("skips an event another run is handling", async () => {
    const { event } = await createPaidEvent({
      paymentMode: "AFTER_REGISTRATION",
      signupClosed: true,
    })
    // Another run holds the event's row lock (for update skip locked)
    const other = await testPool().connect()
    try {
      await other.query("begin")
      await other.query(
        "select id from app_public.events where id = $1 for update",
        [event.id]
      )

      await runTask(sendUnpaidOnClose, {})
      expect(await jobsOf("payment__send_reminder")).toEqual([])

      await other.query("rollback")
    } finally {
      other.release()
    }
    await runTask(sendUnpaidOnClose, {})
    expect(await jobsOf("payment__send_reminder")).toHaveLength(1)
  })

  it("does nothing while payments are disabled", async () => {
    const { event } = await createPaidEvent({
      paymentMode: "AFTER_REGISTRATION",
      signupClosed: true,
    })
    disablePayments()

    await runTask(sendUnpaidOnClose, {})

    expect(await jobsOf("payment__send_reminder")).toEqual([])
    expect(await closeEmailSentAt(event.id)).toBeNull()
  })
})
