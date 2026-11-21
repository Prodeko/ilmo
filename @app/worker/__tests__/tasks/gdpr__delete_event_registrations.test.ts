import deleteOldRegistrations from "../../src/tasks/gdpr__delete_event_registrations"
import {
  createPaidEvent,
  deleteTestData,
  insertPayment,
  paymentById,
  runTask,
  testPool,
} from "../helpers"

// Never gated: this runs with the `payments` flag off, as it must.

beforeEach(deleteTestData)

async function moveEventEnd(eventId: string, daysAgo: number) {
  await testPool().query(
    `update app_public.events
      set
        registration_start_time = now() - interval '1 day' * ($2 + 3),
        registration_end_time = now() - interval '1 day' * ($2 + 2),
        event_start_time = now() - interval '1 day' * ($2 + 1),
        event_end_time = now() - interval '1 day' * $2
      where id = $1`,
    [eventId, daysAgo]
  )
}

async function registrationExists(id: string) {
  const { rowCount } = await testPool().query(
    "select 1 from app_public.registrations where id = $1",
    [id]
  )
  return rowCount === 1
}

describe("gdpr__delete_event_registrations", () => {
  it("deletes old registrations and keeps their payments", async () => {
    const old = await createPaidEvent()
    const recent = await createPaidEvent()
    await moveEventEnd(old.event.id, 61)
    await moveEventEnd(recent.event.id, 10)
    const payment = await insertPayment(old.registrations[0])

    await runTask(deleteOldRegistrations, {})

    expect(await registrationExists(old.registrations[0].id)).toBe(false)
    expect(await registrationExists(recent.registrations[0].id)).toBe(true)
    // The payment is kept for bookkeeping
    expect(await paymentById(payment.id)).toMatchObject({
      status: "PAID",
      registration_id: null,
    })
  })
})
