import task from "../src/tasks/reminder__send_registration"
import sendEmail from "../src/tasks/send_email"

jest.mock("../src/tasks/send_email", () => ({
  __esModule: true,
  default: jest.fn(),
}))

const reminder = {
  id: "reminder",
  language: "fi",
  email: "tester@example.com",
  sent_at: null,
  name: { fi: "Testitapahtuma", en: "Test event" },
  slug: "test-event",
  registration_start_time: "2026-10-24T15:00:00Z",
  is_draft: false,
  already_open: false,
  too_early: false,
}

function context(row: any = reminder) {
  const client = {
    query: jest.fn(async (sql: string) => ({
      rows: sql.startsWith("select r.*") ? (row ? [row] : []) : [],
    })),
  }
  return { client, withPgClient: async (callback) => callback(client) }
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.ROOT_URL = "https://example.com"
  jest.mocked(sendEmail).mockResolvedValue(undefined)
})

it("sends the latest details in Finland time and records success", async () => {
  const helpers = context()
  await task({ id: reminder.id }, helpers as any)
  const payload = jest.mocked(sendEmail).mock.calls[0][0] as any
  expect(payload.options.to).toBe("tester@example.com")
  expect(payload.variables.openingTime).toContain("18.00")
  expect(payload.variables.eventName).toBe("Testitapahtuma")
  expect(payload.variables.eventUrl).toBe(
    "https://example.com/fi/event/test-event"
  )
  expect(helpers.client.query).toHaveBeenCalledWith(
    expect.stringContaining("set email_sent_at"),
    [reminder.id]
  )
  expect(helpers.client.query).toHaveBeenLastCalledWith("commit")
})

it.each([
  null,
  { ...reminder, sent_at: "2026-10-24" },
  { ...reminder, is_draft: true },
  { ...reminder, already_open: true },
  { ...reminder, email: null },
])(
  "does not send cancelled, sent, hidden, expired or unverified reminders",
  async (row) => {
    await task({ id: reminder.id }, context(row) as any)
    expect(sendEmail).not.toHaveBeenCalled()
  }
)

it("reschedules an early job after the opening time changes", async () => {
  const helpers = context({ ...reminder, too_early: true })
  await task({ id: reminder.id }, helpers as any)
  expect(sendEmail).not.toHaveBeenCalled()
  expect(helpers.client.query).toHaveBeenCalledWith(
    "select app_private.schedule_registration_reminder($1)",
    [reminder.id]
  )
})

it("leaves the reminder unsent on delivery failure so the worker can retry", async () => {
  jest.mocked(sendEmail).mockRejectedValue(new Error("SMTP unavailable"))
  const helpers = context()
  await expect(task({ id: reminder.id }, helpers as any)).rejects.toThrow(
    "SMTP unavailable"
  )
  expect(helpers.client.query).toHaveBeenLastCalledWith("rollback")
  expect(
    helpers.client.query.mock.calls.some(([sql]) =>
      sql.includes("set email_sent_at")
    )
  ).toBe(false)
})

it("uses English content and an available event language for links", async () => {
  ;(await task(
    { id: reminder.id },
    context({ ...reminder, language: "en" }) as any
  )) as any
  const payload = jest.mocked(sendEmail).mock.calls[0][0] as any
  expect(payload.options.subject).toContain("registration opens soon")
  expect(payload.variables.eventUrl).toContain("/en/event/")
})

it("uses Helsinki winter time after the daylight saving transition", async () => {
  await task(
    { id: reminder.id },
    context({
      ...reminder,
      registration_start_time: "2026-10-25T15:00:00Z",
    }) as any
  )
  const payload = jest.mocked(sendEmail).mock.calls[0][0] as any
  expect(payload.variables.openingTime).toContain("17.00")
})
