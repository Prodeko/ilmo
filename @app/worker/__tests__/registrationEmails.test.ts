import promotion from "../src/tasks/registration__process_queue"
import confirmation from "../src/tasks/registration__send_confirmation_email"

const event = {
  id: "event",
  slug: "event",
  name: { en: "Test" },
  description: {},
  location: "Otaniemi",
  event_start_time: "2026-10-24T15:00:00Z",
  event_end_time: "2026-10-24T19:00:00Z",
}

function helpers(status = "IN_QUOTA", finished = true) {
  const registration = {
    id: "registration",
    event_id: "event",
    quota_id: "quota",
    email: "tester@example.com",
    first_name: "Test",
    last_name: "User",
    status,
    is_finished: finished,
  }
  return {
    addJob: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(async (sql: string) => {
      if (sql.startsWith("update")) return { rows: [] }
      if (sql.includes("registration_secrets"))
        return {
          rows: [
            {
              update_token: "private-token",
              confirmation_email_sent: false,
              received_spot_from_queue_email_sent: false,
            },
          ],
        }
      if (sql.includes("app_public.registrations"))
        return { rows: [registration] }
      if (sql.includes("app_public.events")) return { rows: [event] }
      if (sql.includes("app_public.quotas"))
        return { rows: [{ title: { en: "Test quota" } }] }
      throw new Error("Unexpected query")
    }),
  }
}

beforeAll(() => {
  process.env.ROOT_URL = "https://example.com"
})

it.each(["IN_QUOTA", "IN_OPEN_QUOTA"])(
  "attaches an invitation to a %s confirmation",
  async (status) => {
    const context = helpers(status)
    await confirmation({ id: "registration" }, context as any)
    const payload = context.addJob.mock.calls[0][1]
    expect(payload.template).toBe("event_registration.mjml.njk")
    expect(payload.options.to).toBe("tester@example.com")
    expect(payload.options.icalEvent.method).toBe("REQUEST")
    expect(payload.variables.isWaitlisted).toBe(false)
    expect(payload.variables.eventRegistrationUpdateLink).toContain(
      "private-token"
    )
    expect(payload.options.icalEvent.content).not.toContain("private-token")
  }
)

it("sends a waitlist confirmation without a calendar invitation", async () => {
  const context = helpers("IN_QUEUE")
  await confirmation({ id: "registration" }, context as any)
  expect(context.addJob.mock.calls[0][1].options.icalEvent).toBeUndefined()
  expect(context.addJob.mock.calls[0][1].variables.isWaitlisted).toBe(true)
  expect(context.addJob.mock.calls[0][1].options.subject).toContain(
    "Added to waiting list"
  )
})

it("does not send a confirmation for an unfinished signup", async () => {
  const context = helpers("IN_QUOTA", false)
  await confirmation({ id: "registration" }, context as any)
  expect(context.addJob).not.toHaveBeenCalled()
})

it("attaches an invitation when a user receives a place from the queue", async () => {
  const context = helpers()
  await promotion(
    { receivedSpot: { id: "registration", event_id: "event" } },
    context as any
  )
  expect(context.addJob.mock.calls[0][1].template).toBe(
    "spot_from_queue.mjml.njk"
  )
  expect(context.addJob.mock.calls[0][1].options.icalEvent.method).toBe(
    "REQUEST"
  )
})
