import deleteOldRegistrations from "../../src/tasks/gdpr__delete_event_registrations"
import {
  createPaidEvent,
  deleteTestData,
  enablePaymentsForEachTest,
  insertPayment,
  jobsOf,
  paymentById,
  runTask,
  testPool,
} from "../helpers"

jest.mock("stripe", () => require("../stripeMock").mockStripeModule())

enablePaymentsForEachTest()

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
  it("deletes old registrations without refunding their card payments", async () => {
    const old = await createPaidEvent()
    const recent = await createPaidEvent()
    await moveEventEnd(old.event.id, 61)
    await moveEventEnd(recent.event.id, 10)
    const payment = await insertPayment(old.registrations[0])

    await runTask(deleteOldRegistrations, {})

    expect(await registrationExists(old.registrations[0].id)).toBe(false)
    expect(await registrationExists(recent.registrations[0].id)).toBe(true)
    expect(await jobsOf("payment__refund")).toEqual([])
    // The payment is kept for bookkeeping
    expect(await paymentById(payment.id)).toMatchObject({
      status: "PAID",
      registration_id: null,
    })
  })

  it("still refunds registrations deleted afterwards", async () => {
    const old = await createPaidEvent()
    await moveEventEnd(old.event.id, 61)
    await runTask(deleteOldRegistrations, {})

    const { registrations } = await createPaidEvent()
    const payment = await insertPayment(registrations[0])
    await testPool().query(
      "delete from app_public.registrations where id = $1",
      [registrations[0].id]
    )
    expect(await jobsOf("payment__refund")).toEqual([{ paymentId: payment.id }])
  })
})
