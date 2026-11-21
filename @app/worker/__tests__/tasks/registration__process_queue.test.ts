import processQueue from "../../src/tasks/registration__process_queue"
import sendEmail from "../../src/tasks/send_email"
import {
  createPaidEvent,
  deleteTestData,
  getEmails,
  jobsOf,
  runTask,
  sendQueuedEmails,
  setFeatureFlag,
  testPool,
} from "../helpers"

beforeEach(deleteTestData)
beforeEach(() => setFeatureFlag(testPool(), "payments", "on"))

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
  it("adds the payment link once registration has closed", async () => {
    const { payload, token } = await moveUpFromQueue({ signupClosed: true })

    expect(payload.template).toEqual("spot_from_queue.mjml.njk")
    expect(payload.variables).toMatchObject({
      price: 1800,
      serviceFee: 25,
      total: 1825,
      payLink: `pay/${token}`,
    })
    await sendQueuedEmails(sendEmail)
    const { text } = JSON.parse(getEmails()[0].message)
    expect(text).toContain("Maksa 18,25 €")
  })

  it.each([
    ["while registration is open", {}, false],
    ["for a free quota", { priceCents: 0, signupClosed: true }, false],
    ["while the payments flag is off", { signupClosed: true }, true],
  ])("sends the normal email %s", async (_name, options, disable) => {
    if (disable) await setFeatureFlag(testPool(), "payments", "off")
    const { payload } = await moveUpFromQueue(options)

    expect(Object.keys(payload.variables).sort()).toEqual(
      NON_PAID_VARIABLE_KEYS
    )
  })
})
