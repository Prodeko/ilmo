import { telegramRequest } from "@app/lib/dist/cjs/telegram"

import sendReminderEmail from "../src/tasks/reminder__send_registration"
import sendReminderTelegram from "../src/tasks/reminder__send_telegram"
import telegramReply from "../src/tasks/telegram__reply"

import type { FeatureKey } from "@app/lib"

jest.mock("@app/lib/dist/cjs/telegram", () => ({
  ...jest.requireActual("@app/lib/dist/cjs/telegram"),
  telegramRequest: jest.fn(),
}))

/*
 * Each reminder job checks its flags when it runs. While a flag is off the
 * job completes without touching the reminder (the send is not retried
 * later) and without contacting Telegram.
 */

function helpers(enabled: FeatureKey[]) {
  const client = { query: jest.fn(async () => ({ rows: [] })) }
  return {
    job: { task_identifier: "test" },
    logger: { info: jest.fn() },
    query: jest.fn(async (_sql: string, [key]: [FeatureKey]) => ({
      rows: [{ enabled: enabled.includes(key) }],
    })),
    withPgClient: jest.fn(async (callback: any) => callback(client)),
    client,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("reminder__send_registration", () => {
  it("does nothing while registration_reminders is off", async () => {
    const context = helpers(["telegram_reminders", "calendar_invites"])
    await sendReminderEmail({ id: "reminder" }, context as any)
    expect(context.query).toHaveBeenCalledWith(
      "select app_public.feature_enabled($1) as enabled",
      ["registration_reminders"]
    )
    expect(context.withPgClient).not.toHaveBeenCalled()
  })

  it("runs while registration_reminders is on", async () => {
    const context = helpers(["registration_reminders"])
    await sendReminderEmail({ id: "reminder" }, context as any)
    expect(context.withPgClient).toHaveBeenCalledTimes(1)
  })
})

describe("reminder__send_telegram", () => {
  it.each<[string, FeatureKey[]]>([
    ["both flags are off", []],
    ["only registration_reminders is on", ["registration_reminders"]],
    ["only telegram_reminders is on", ["telegram_reminders"]],
  ])("does nothing while %s", async (_, enabled) => {
    const context = helpers(enabled)
    await sendReminderTelegram({ id: "reminder" }, context as any)
    expect(context.withPgClient).not.toHaveBeenCalled()
    expect(telegramRequest).not.toHaveBeenCalled()
  })

  it("runs while both flags are on", async () => {
    const context = helpers(["registration_reminders", "telegram_reminders"])
    await sendReminderTelegram({ id: "reminder" }, context as any)
    expect(context.withPgClient).toHaveBeenCalledTimes(1)
  })
})

describe("telegram__reply", () => {
  it("does not reply while telegram_reminders is off", async () => {
    const context = helpers(["registration_reminders"])
    await telegramReply({ chatId: 42, reply: "welcome" }, context as any)
    expect(context.withPgClient).not.toHaveBeenCalled()
    expect(telegramRequest).not.toHaveBeenCalled()
  })
})
