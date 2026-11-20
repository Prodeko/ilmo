import { CALENDAR_INVITATION_CONTENT_TYPE } from "../src/calendarInvitation"
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

function helpers(status = "IN_QUOTA", finished = true, calendarInvites = true) {
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
      if (sql.includes("feature_enabled"))
        return { rows: [{ enabled: calendarInvites }] }
      if (sql.includes("registration_secrets"))
        return {
          rows: [
            {
              registration_id: "registration",
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
        return { rows: [{ id: "quota", title: { en: "Test quota" } }] }
      throw new Error("Unexpected query")
    }),
  }
}

const invitations = (payload: any) =>
  (payload.attachments ?? []).filter(
    (attachment: any) =>
      attachment.contentType === CALENDAR_INVITATION_CONTENT_TYPE
  )

it.each(["IN_QUOTA", "IN_OPEN_QUOTA"])(
  "attaches an invitation to a %s confirmation",
  async (status) => {
    const context = helpers(status)
    await confirmation({ id: "registration" }, context as any)
    const payload = context.addJob.mock.calls[0][1]
    expect(payload.template).toBe("event_registration.mjml.njk")
    expect(payload.options.to).toBe("tester@example.com")
    const [invitation] = invitations(payload)
    expect(invitation.filename).toBe("event.ics")
    expect(invitation.content).toContain("METHOD:REQUEST\r\n")
    expect(payload.variables.isWaitlisted).toBe(false)
    expect(payload.variables.eventRegistrationUpdateLink).toContain(
      "private-token"
    )
    expect(invitation.content).not.toContain("private-token")
  }
)

it("sends a waitlist confirmation without a calendar invitation", async () => {
  const context = helpers("IN_QUEUE")
  await confirmation({ id: "registration" }, context as any)
  const payload = context.addJob.mock.calls[0][1]
  expect(invitations(payload)).toEqual([])
  expect(payload.variables.isWaitlisted).toBe(true)
  expect(payload.options.subject).toContain("Added to waiting list")
})

it("does not send a confirmation for an unfinished signup", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {})
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
  const payload = context.addJob.mock.calls[0][1]
  expect(payload.template).toBe("spot_from_queue.mjml.njk")
  expect(invitations(payload)).toHaveLength(1)
})

describe("with calendar_invites off", () => {
  it.each([
    ["confirmation", confirmation, { id: "registration" }],
    [
      "spot from queue",
      promotion,
      { receivedSpot: { id: "registration", event_id: "event" } },
    ],
  ])("sends the %s email without an invitation", async (_, task, payload) => {
    const context = helpers("IN_QUOTA", true, false)
    await task(payload as any, context as any)
    const email = context.addJob.mock.calls[0][1]
    expect(email).not.toHaveProperty("attachments")
    expect(context.query).toHaveBeenCalledWith(
      "select app_public.feature_enabled($1) as enabled",
      ["calendar_invites"]
    )
  })
})
