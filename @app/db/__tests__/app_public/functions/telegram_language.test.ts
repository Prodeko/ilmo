import { telegramRequest } from "@app/lib/dist/cjs/telegram"

import {
  processTelegramUpdate,
  TelegramUpdate,
} from "../../../../server/src/telegram"
import telegramReminder from "../../../../worker/src/tasks/reminder__send_telegram"
import {
  asRoot,
  becomeUser,
  createEventCategories,
  createEvents,
  createOrganizations,
  createUsers,
  withRootDb,
} from "../../helpers"

jest.mock("@app/lib/dist/cjs/telegram", () => ({
  ...jest.requireActual("@app/lib/dist/cjs/telegram"),
  telegramRequest: jest.fn(),
}))

function message(
  update_id: number,
  text: string,
  language_code?: string
): TelegramUpdate {
  return {
    update_id,
    message: {
      text,
      chat: { id: 12345, type: "private" },
      from: { id: 12345, language_code },
    },
  }
}

it("detects language, preserves explicit choices, and supports returning to automatic", () =>
  withRootDb(async (client) => {
    const preferences = async () =>
      (
        await client.query(
          "select * from app_private.telegram_preferences where chat_id = 12345"
        )
      ).rows[0]
    await asRoot(client, async () => {
      await processTelegramUpdate(client, message(100, "/start", "fi-FI"))
      expect(await preferences()).toMatchObject({
        language: "auto",
        detected_language: "fi",
      })
      await processTelegramUpdate(client, message(101, "/language en", "fi"))
      await processTelegramUpdate(client, message(102, "/start", "fi"))
      expect(await preferences()).toMatchObject({
        language: "en",
        detected_language: "fi",
      })
      await processTelegramUpdate(client, message(103, "/language auto", "fi"))
      await processTelegramUpdate(client, message(104, "/start"))
      expect(await preferences()).toMatchObject({
        language: "auto",
        detected_language: "fi",
      })
      await processTelegramUpdate(client, message(105, "/start", "sv"))
      expect(await preferences()).toMatchObject({
        language: "auto",
        detected_language: "en",
      })
    })
  }))
it("validates button ownership and deduplicates language changes", () =>
  withRootDb(async (client) =>
    asRoot(client, async () => {
      const update: TelegramUpdate = {
        update_id: 200,
        callback_query: {
          id: "cb",
          data: "language:fi",
          from: { id: 12345, language_code: "en" },
          message: { chat: { id: 12345, type: "private" } },
        },
      }
      await processTelegramUpdate(client, update)
      await processTelegramUpdate(client, update)
      expect(
        (
          await client.query(
            "select language from app_private.telegram_preferences where chat_id = 12345"
          )
        ).rows[0].language
      ).toBe("fi")
      const jobs = (
        await client.query(
          "select j.payload from graphile_worker._private_jobs j join graphile_worker._private_tasks t on t.id = j.task_id where t.identifier = 'telegram__reply'"
        )
      ).rows
      expect(jobs).toHaveLength(1)
      expect(jobs[0].payload).toMatchObject({
        chatId: 12345,
        reply: "languageSaved",
        callbackQueryId: "cb",
      })
      await processTelegramUpdate(client, {
        ...update,
        update_id: 201,
        callback_query: {
          ...update.callback_query!,
          from: { id: 54321 },
          data: "language:en",
        },
      })
      await processTelegramUpdate(client, {
        ...update,
        update_id: 202,
        callback_query: {
          ...update.callback_query!,
          message: { chat: { id: 12345, type: "group" } },
          data: "language:en",
        },
      })
      expect(
        (
          await client.query(
            "select language from app_private.telegram_preferences where chat_id = 12345"
          )
        ).rows[0].language
      ).toBe("fi")
    })
  ))
it("falls back to English for a new chat without a language hint and prompts for invalid choices", () =>
  withRootDb(async (client) =>
    asRoot(client, async () => {
      await processTelegramUpdate(client, message(300, "/language unsupported"))
      expect(
        (
          await client.query(
            "select * from app_private.telegram_preferences where chat_id = 12345"
          )
        ).rows[0]
      ).toMatchObject({ language: "auto", detected_language: "en" })
      const jobs = (
        await client.query(
          "select j.payload from graphile_worker._private_jobs j join graphile_worker._private_tasks t on t.id = j.task_id where t.identifier = 'telegram__reply'"
        )
      ).rows
      expect(jobs[0].payload.reply).toBe("languageMenu")
    })
  ))
it("retains preferences after disconnecting and keeps them private", () =>
  withRootDb(async (client) => {
    const [user] = await createUsers(client)
    await asRoot(client, async () => {
      await processTelegramUpdate(client, message(400, "/language fi", "en"))
      await processTelegramUpdate(client, message(401, "/stop", "en"))
      expect(
        (
          await client.query(
            "select language from app_private.telegram_preferences where chat_id = 12345"
          )
        ).rows[0].language
      ).toBe("fi")
    })
    await becomeUser(client, user.id)
    await expect(
      client.query("select * from app_private.telegram_preferences")
    ).rejects.toHaveProperty("code", "42501")
  }))

it("delivers an already scheduled reminder in the newly selected bot language", () =>
  withRootDb(async (client) => {
    const [user] = await createUsers(client)
    await becomeUser(client, user.id)
    const [org] = await createOrganizations(client, 1)
    const [category] = await createEventCategories(client, 1, org.id)
    const [event] = await createEvents(client, 1, org.id, category.id, false)
    const token = (
      await client.query("select app_public.request_telegram_link() as token")
    ).rows[0].token
    await asRoot(client, async () => {
      await processTelegramUpdate(client, message(500, `/start ${token}`, "fi"))
      await client.query(
        "update app_public.events set registration_start_time = now() + interval '10 minutes' where id = $1",
        [event.id]
      )
    })
    await client.query(
      "select app_public.set_event_registration_reminder($1, true, 'fi', 30, 'telegram')",
      [event.id]
    )
    const reminder = (
      await client.query(
        "select * from app_public.event_registration_reminders where event_id = $1",
        [event.id]
      )
    ).rows[0]
    await asRoot(client, async () => {
      await processTelegramUpdate(client, message(501, "/language en", "fi"))
      jest.mocked(telegramRequest).mockResolvedValue({})
      process.env.ROOT_URL = "https://example.com"
      const deliveryClient = {
        query: (sql: string, args?: unknown[]) =>
          client.query(
            sql === "begin"
              ? "savepoint bot_language_delivery"
              : sql === "commit"
                ? "release savepoint bot_language_delivery"
                : sql === "rollback"
                  ? "rollback to savepoint bot_language_delivery"
                  : sql,
            args
          ),
      }
      await telegramReminder({ id: reminder.id }, {
        withPgClient: async (callback) => callback(deliveryClient),
      } as any)
      expect(telegramRequest).toHaveBeenCalledWith(
        "sendMessage",
        expect.objectContaining({
          text: expect.stringContaining("Registration reminder"),
          reply_markup: {
            inline_keyboard: [
              [expect.objectContaining({ text: "Open event" })],
            ],
          },
        })
      )
      const stored = (
        await client.query(
          "select language, telegram_sent_at from app_public.event_registration_reminders where id = $1",
          [reminder.id]
        )
      ).rows[0]
      expect(stored.language).toBe("fi")
      expect(stored.telegram_sent_at).not.toBeNull()
    })
  }))
