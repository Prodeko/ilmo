import processQueue from "../../src/tasks/registration__process_queue"
import {
  createPaidEvent,
  deleteTestData,
  disablePayments,
  enablePaymentsForEachTest,
  jobsOf,
  runTask,
  testPool,
} from "../helpers"

jest.mock("stripe", () => require("../stripeMock").mockStripeModule())

enablePaymentsForEachTest()

beforeEach(deleteTestData)

/**
 * Deletes the first registration, so the queued second one gets the spot,
 * and runs the queue job for it.
 */
async function moveUpFromQueue(options = {}) {
  const data = await createPaidEvent({
    quotaSize: 1,
    registrationCount: 2,
    ...options,
  })
  const [first, second] = data.registrations
  await testPool().query("delete from app_public.registrations where id = $1", [
    first.id,
  ])
  await testPool().query(
    "refresh materialized view app_hidden.registrations_status_and_position"
  )
  await testPool().query("delete from graphile_worker._private_jobs")
  await runTask(processQueue, {
    receivedSpot: {
      id: second.id,
      event_id: second.event_id,
      quota_id: second.quota_id,
      status: "IN_QUEUE",
      position: 1,
    },
  })
  const [payload] = await jobsOf("send_email")
  return { ...data, payload, token: data.tokens[1] }
}

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

describe("registration__process_queue", () => {
  it("adds the payment link in DURING_REGISTRATION mode", async () => {
    const { payload, token } = await moveUpFromQueue()

    expect(payload.template).toEqual("spot_from_queue.mjml.njk")
    expect(payload.variables).toMatchObject({
      price: 1800,
      serviceFee: 25,
      total: 1825,
      paymentMode: "DURING_REGISTRATION",
      payLink: `pay/${token}`,
    })
  })

  it("adds the payment link after close in AFTER_REGISTRATION mode", async () => {
    const { payload, token } = await moveUpFromQueue({
      paymentMode: "AFTER_REGISTRATION",
      signupClosed: true,
    })

    expect(payload.variables).toMatchObject({ payLink: `pay/${token}` })
  })

  it.each([
    [
      "before close in AFTER_REGISTRATION mode",
      { paymentMode: "AFTER_REGISTRATION" },
      false,
    ],
    ["for an event without payments", { paymentMode: "NONE" }, false],
    ["for a free quota", { priceCents: 0 }, false],
    ["while payments are disabled", {}, true],
  ])("sends the normal email %s", async (_name, options, disable) => {
    if (disable) disablePayments()
    const { payload } = await moveUpFromQueue(options)

    expect(Object.keys(payload.variables).sort()).toEqual(
      NON_PAID_VARIABLE_KEYS
    )
  })
})
