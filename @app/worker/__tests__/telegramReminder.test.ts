import { TelegramError, telegramRequest } from "@app/lib/dist/cjs/telegram"

import { registrationReminderTask } from "../src/tasks/reminder__send_registration"
import sendEmail from "../src/tasks/send_email"

jest.mock("@app/lib/dist/cjs/telegram", () => ({
  ...jest.requireActual("@app/lib/dist/cjs/telegram"),
  telegramRequest: jest.fn(),
}))
jest.mock("../src/tasks/send_email", () => ({
  __esModule: true,
  default: jest.fn(),
}))

const reminder = {
  id: "test",
  user_id: "user",
  language: "fi",
  bot_language: "fi",
  delivery_method: "both",
  name: { fi: "Testitapahtuma", en: "Test event" },
  slug: "test",
  registration_start_time: "2026-10-24T15:00:00Z",
  email: "test@example.com",
  chat_id: "1234",
}
function context(row: any = reminder) {
  const client = {
    query: jest.fn(async (sql: string) => ({
      rows: sql.startsWith("select r.*") ? [row] : [],
    })),
  }
  return { client, withPgClient: async (callback) => callback(client) }
}
beforeEach(() => {
  jest.clearAllMocks()
  process.env.ROOT_URL = "https://example.com"
  jest.mocked(telegramRequest).mockResolvedValue({})
  jest.mocked(sendEmail).mockResolvedValue(undefined)
})
it("sends a Telegram reminder with Finland time and an event button", async () => {
  await registrationReminderTask("telegram")({ id: "test" }, context() as any)
  expect(telegramRequest).toHaveBeenCalledWith(
    "sendMessage",
    expect.objectContaining({
      chat_id: "1234",
      parse_mode: "HTML",
      text: expect.stringContaining("la 24.10. klo 18.00"),
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Avaa tapahtuma",
              url: "https://example.com/fi/event/test",
            },
          ],
        ],
      },
    })
  )
  expect(sendEmail).not.toHaveBeenCalled()
  const text = jest.mocked(telegramRequest).mock.calls[0][1].text as string
  expect(text).toMatch(/^🔔 Ilmoittautumismuistutus/)
  expect(text).toContain("<b>Testitapahtuma</b>")
  expect(text).not.toContain("avautuu pian")
  expect(text).not.toContain("Suomen aikaa")
  expect(text).not.toContain("Muistutus ei varaa")
})
it.each([
  { ...reminder, delivery_method: "email" },
  { ...reminder, chat_id: null },
  { ...reminder, telegram_sent_at: "2026-10-24" },
  { ...reminder, is_draft: true },
  { ...reminder, already_open: true },
])(
  "skips missing connections and ineligible or already delivered reminders",
  async (row) => {
    await registrationReminderTask("telegram")(
      { id: "test" },
      context(row) as any
    )
    expect(telegramRequest).not.toHaveBeenCalled()
  }
)
it("does not resend email when retrying Telegram for a both reminder", async () => {
  const row = { ...reminder, email_sent_at: "2026-10-24" }
  await registrationReminderTask("email")({ id: "test" }, context(row) as any)
  await registrationReminderTask("telegram")(
    { id: "test" },
    context(row) as any
  )
  expect(sendEmail).not.toHaveBeenCalled()
  expect(telegramRequest).toHaveBeenCalledTimes(1)
})
it("disconnects a blocked bot without endless retries", async () => {
  jest.mocked(telegramRequest).mockRejectedValue(new TelegramError(403))
  const helpers = context()
  await registrationReminderTask("telegram")({ id: "test" }, helpers as any)
  expect(helpers.client.query).toHaveBeenCalledWith(
    "select app_private.disconnect_telegram($1)",
    ["user"]
  )
  expect(helpers.client.query).toHaveBeenLastCalledWith("commit")
})
it("reschedules rate-limited messages using Telegram's retry delay", async () => {
  jest.mocked(telegramRequest).mockRejectedValue(new TelegramError(429, 42))
  const helpers = context()
  await registrationReminderTask("telegram")({ id: "test" }, helpers as any)
  expect(helpers.client.query).toHaveBeenCalledWith(
    expect.stringContaining("run_at := clock_timestamp()"),
    [JSON.stringify({ id: "test" }), 42, "registration-reminder:test:telegram"]
  )
})
it("rolls back on a temporary failure so delivery can retry", async () => {
  jest.mocked(telegramRequest).mockRejectedValue(new TelegramError(500))
  const helpers = context()
  await expect(
    registrationReminderTask("telegram")({ id: "test" }, helpers as any)
  ).rejects.toThrow()
  expect(helpers.client.query).toHaveBeenLastCalledWith("rollback")
})

it.each([
  ["en", "fi", "Registration reminder", "/en/event/test"],
  ["fi", "en", "Ilmoittautumismuistutus", "/fi/event/test"],
  ["auto", "fi", "Ilmoittautumismuistutus", "/fi/event/test"],
  ["auto", "sv", "Registration reminder", "/en/event/test"],
  [undefined, undefined, "Registration reminder", "/en/event/test"],
])(
  "uses bot preference %s and detected %s instead of saved website language",
  async (preference, detected, text, url) => {
    await registrationReminderTask("telegram")(
      { id: "test" },
      context({
        ...reminder,
        bot_language: preference,
        bot_detected_language: detected,
      }) as any
    )
    expect(telegramRequest).toHaveBeenCalledWith(
      "sendMessage",
      expect.objectContaining({
        text: expect.stringContaining(text),
        reply_markup: {
          inline_keyboard: [
            [expect.objectContaining({ url: `https://example.com${url}` })],
          ],
        },
      })
    )
  }
)
it("keeps email language independent from the bot preference", async () => {
  await registrationReminderTask("email")(
    { id: "test" },
    context({ ...reminder, bot_language: "en" }) as any
  )
  expect(sendEmail).toHaveBeenCalledWith(
    expect.objectContaining({
      variables: expect.objectContaining({ language: "fi" }),
    }),
    expect.anything()
  )
})

it("includes the year when the registration date is in a different year", async () => {
  await registrationReminderTask("telegram")(
    { id: "test" },
    context({
      ...reminder,
      registration_start_time: "2027-10-24T15:00:00Z",
    }) as any
  )
  const text = jest.mocked(telegramRequest).mock.calls[0][1].text as string
  expect(text).toContain("su 24.10.2027 klo 18.00")
})

it("escapes event names in Telegram HTML formatting", async () => {
  await registrationReminderTask("telegram")(
    { id: "test" },
    context({
      ...reminder,
      name: { fi: "<b>Rock & Roll</b>", en: "Rock & Roll" },
    }) as any
  )
  expect(telegramRequest).toHaveBeenCalledWith(
    "sendMessage",
    expect.objectContaining({
      parse_mode: "HTML",
      text: expect.stringContaining(
        "<b>&lt;b&gt;Rock &amp; Roll&lt;/b&gt;</b>"
      ),
    })
  )
})

it("keeps a readable event link for local HTTP testing", async () => {
  process.env.ROOT_URL = "http://localhost:5678"
  await registrationReminderTask("telegram")({ id: "test" }, context() as any)
  expect(telegramRequest).toHaveBeenCalledWith(
    "sendMessage",
    expect.objectContaining({
      parse_mode: "HTML",
      text: expect.stringContaining("🔗 http://localhost:5678/fi/event/test"),
    })
  )
  expect(jest.mocked(telegramRequest).mock.calls[0][1]).not.toHaveProperty(
    "reply_markup"
  )
})
