import { TelegramError, telegramRequest } from "@app/lib/dist/cjs/telegram"

import replyTask from "../src/tasks/telegram__reply"

jest.mock("@app/lib/dist/cjs/telegram", () => ({
  ...jest.requireActual("@app/lib/dist/cjs/telegram"),
  telegramRequest: jest.fn(),
}))

function context(language = "auto", detected_language = "en") {
  return {
    withPgClient: async (callback) =>
      callback({
        query: jest.fn(async () => ({
          rows: [{ language, detected_language }],
        })),
      }),
  }
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(telegramRequest).mockResolvedValue({})
})
it("resolves queued replies using the current preference at delivery", async () => {
  const payload = { chatId: 123, reply: "connected" }
  await replyTask(payload, context("fi", "en") as any)
  expect(telegramRequest).toHaveBeenLastCalledWith(
    "sendMessage",
    expect.objectContaining({
      text: expect.stringContaining("Telegram yhdistetty!"),
    })
  )
  expect(jest.mocked(telegramRequest).mock.calls[0][1].text).toContain(
    "Change language:"
  )
  await replyTask(payload, context("en", "fi") as any)
  expect(telegramRequest).toHaveBeenLastCalledWith(
    "sendMessage",
    expect.objectContaining({
      text: expect.stringContaining("Telegram connected!"),
    })
  )
})
it("shows language buttons with stable native names and acknowledges selection", async () => {
  await replyTask(
    { chatId: 123, reply: "languageSaved", callbackQueryId: "callback" },
    context("fi") as any
  )
  expect(telegramRequest).toHaveBeenNthCalledWith(1, "answerCallbackQuery", {
    callback_query_id: "callback",
  })
  expect(telegramRequest).toHaveBeenLastCalledWith(
    "sendMessage",
    expect.objectContaining({
      text: expect.stringContaining("Botin kieliasetus tallennettu"),
      reply_markup: {
        inline_keyboard: [
          [
            { text: "English", callback_data: "language:en" },
            { text: "Suomi", callback_data: "language:fi" },
            { text: "Automaattinen", callback_data: "language:auto" },
          ],
        ],
      },
    })
  )
})
it("still sends a reply if a callback acknowledgement has expired", async () => {
  jest.mocked(telegramRequest).mockRejectedValueOnce(new TelegramError(400))
  await replyTask(
    { chatId: 123, reply: "languageSaved", callbackQueryId: "old" },
    context() as any
  )
  expect(telegramRequest).toHaveBeenLastCalledWith(
    "sendMessage",
    expect.anything()
  )
})
it("automatically uses Finnish and falls back to English for unsupported languages", async () => {
  await replyTask(
    { chatId: 123, reply: "welcome" },
    context("auto", "fi") as any
  )
  expect(telegramRequest).toHaveBeenLastCalledWith(
    "sendMessage",
    expect.objectContaining({ text: expect.stringContaining("Yhdistä tilisi") })
  )
  await replyTask(
    { chatId: 123, reply: "welcome" },
    context("auto", "sv") as any
  )
  expect(telegramRequest).toHaveBeenLastCalledWith(
    "sendMessage",
    expect.objectContaining({
      text: expect.stringContaining("Connect your account"),
    })
  )
})
it("supports text-only replies already queued by older server versions", async () => {
  await replyTask({ chatId: 123, text: "Already queued" }, context() as any)
  expect(telegramRequest).toHaveBeenCalledWith("sendMessage", {
    chat_id: 123,
    text: "Already queued",
  })
})
