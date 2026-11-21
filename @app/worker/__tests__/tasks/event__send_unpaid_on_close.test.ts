import sendUnpaidOnClose from "../../src/tasks/event__send_unpaid_on_close"
import {
  createPaidEvent,
  deleteTestData,
  insertPayment,
  jobsOf,
  runTask,
  setFeatureFlag,
  testPool,
} from "../helpers"

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

  it("sends again when registration is reopened and closes again", async () => {
    const { event, registrations } = await createPaidEvent({
      quotaSize: 3,
      registrationCount: 2,
      signupClosed: true,
    })
    await runTask(sendUnpaidOnClose, {})
    await insertPayment(registrations[0])

    // Reopened: moving the end later clears the timestamp
    await testPool().query(
      `update app_public.events
        set registration_end_time = now() + interval '1 day'
        where id = $1`,
      [event.id]
    )
    expect(await closeEmailSentAt(event.id)).toBeNull()
    await runTask(sendUnpaidOnClose, {})
    expect(await jobsOf("payment__send_reminder")).toHaveLength(2)

    // Closed again: only the still unpaid registration is reminded
    await testPool().query(
      `update app_public.events
        set registration_end_time = now() - interval '1 second'
        where id = $1`,
      [event.id]
    )
    await runTask(sendUnpaidOnClose, {})
    expect(await jobsOf("payment__send_reminder")).toEqual([
      { registrationId: registrations[0].id, closed: true },
      { registrationId: registrations[1].id, closed: true },
      { registrationId: registrations[1].id, closed: true },
    ])
    expect(await closeEmailSentAt(event.id)).toBeTruthy()
  })

  it.each([
    ["registration is still open", {}],
    ["the event is free", { priceCents: 0, signupClosed: true }],
  ] as const)("skips an event when %s", async (_name, options) => {
    const { event } = await createPaidEvent(options)

    await runTask(sendUnpaidOnClose, {})

    expect(await jobsOf("payment__send_reminder")).toEqual([])
    expect(await closeEmailSentAt(event.id)).toBeNull()
  })

  it("skips an event another run is handling", async () => {
    const { event } = await createPaidEvent({
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
      signupClosed: true,
    })
    await setFeatureFlag(testPool(), "payments", "off")

    await runTask(sendUnpaidOnClose, {})

    expect(await jobsOf("payment__send_reminder")).toEqual([])
    expect(await closeEmailSentAt(event.id)).toBeNull()
  })
})
