import sendUnpaidOnClose from "../../src/tasks/event__send_unpaid_on_close"
import {
  configureStripeForEachTest,
  createPaidEvent,
  deleteTestData,
  insertPayment,
  jobsOf,
  runTask,
  setFeatureFlag,
  testPool,
} from "../helpers"

jest.mock("stripe", () => require("../stripeMock").mockStripeModule())

configureStripeForEachTest()

beforeEach(deleteTestData)
beforeEach(async () => {
  await setFeatureFlag(testPool(), "payments", "on")
  await switchedOnAgo("1 day")
})

/** Sets when the `payments` flag was last switched, as set_feature_flag does. */
async function switchedOnAgo(interval: string) {
  await testPool().query(
    "update app_public.feature_flags set updated_at = now() - $1::interval where key = 'payments'",
    [interval]
  )
}

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

    // The close email is now marked sent: the next run (a minute later)
    // finds nothing to do
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

  it("skips events that closed before the payments flag was switched on", async () => {
    const { event } = await createPaidEvent({
      paymentMode: "AFTER_REGISTRATION",
      signupClosed: true,
    })
    // Registration closed a minute ago, the flag was switched on just now
    await switchedOnAgo("0 seconds")

    await runTask(sendUnpaidOnClose, {})

    expect(await jobsOf("payment__send_reminder")).toEqual([])
    expect(await closeEmailSentAt(event.id)).toBeNull()
  })

  it("does nothing while the payments flag is off", async () => {
    const { event } = await createPaidEvent({
      paymentMode: "AFTER_REGISTRATION",
      signupClosed: true,
    })
    await setFeatureFlag(testPool(), "payments", "off")

    await runTask(sendUnpaidOnClose, {})

    expect(await jobsOf("payment__send_reminder")).toEqual([])
    expect(await closeEmailSentAt(event.id)).toBeNull()
  })
})
