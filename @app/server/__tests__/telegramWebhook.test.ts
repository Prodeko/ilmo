import Fastify from "fastify"

import installTelegram from "../src/middleware/installTelegram"
import { handleTelegramUpdate } from "../src/telegram"

jest.mock("../src/telegram", () => ({ handleTelegramUpdate: jest.fn() }))

const original = {
  NODE_ENV: process.env.NODE_ENV,
  JEST_WORKER_ID: process.env.JEST_WORKER_ID,
  IN_TESTS: process.env.IN_TESTS,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_UPDATE_MODE: process.env.TELEGRAM_UPDATE_MODE,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
}
beforeEach(() => {
  jest.clearAllMocks()
  Object.assign(process.env, { NODE_ENV: "production" })
  delete process.env.IN_TESTS
  delete process.env.JEST_WORKER_ID
  process.env.TELEGRAM_BOT_TOKEN = "test-token"
  process.env.TELEGRAM_UPDATE_MODE = "webhook"
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret"
})
afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})
it.each([undefined, "wrong-secret"])(
  "rejects unauthenticated webhook requests",
  async (secret) => {
    const app = Fastify()
    await app.register(installTelegram)
    try {
      const response = await app.inject({
        method: "POST",
        url: "/telegram/webhook",
        payload: { update_id: 123 },
        headers: secret ? { "x-telegram-bot-api-secret-token": secret } : {},
      })
      expect(response.statusCode).toBe(403)
      expect(handleTelegramUpdate).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  }
)
it("passes authenticated valid updates even when the local app uses NODE_ENV=test", async () => {
  Object.assign(process.env, { NODE_ENV: "test" })
  const app = Fastify()
  app.decorate("rootPgPool", {} as any)
  await app.register(installTelegram)
  try {
    const response = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      payload: { update_id: 123 },
      headers: { "x-telegram-bot-api-secret-token": "test-webhook-secret" },
    })
    expect(response.statusCode).toBe(200)
    expect(handleTelegramUpdate).toHaveBeenCalledWith(app.rootPgPool, {
      update_id: 123,
    })
  } finally {
    await app.close()
  }
})
it("rejects malformed authenticated updates", async () => {
  const app = Fastify()
  await app.register(installTelegram)
  try {
    const response = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      payload: {},
      headers: { "x-telegram-bot-api-secret-token": "test-webhook-secret" },
    })
    expect(response.statusCode).toBe(400)
    expect(handleTelegramUpdate).not.toHaveBeenCalled()
  } finally {
    await app.close()
  }
})
it("refuses webhook mode without its secret", async () => {
  delete process.env.TELEGRAM_WEBHOOK_SECRET
  const app = Fastify()
  await expect(app.register(installTelegram)).rejects.toThrow(
    "TELEGRAM_WEBHOOK_SECRET"
  )
  await app.close()
})

it("does not enable Telegram inside an actual automated test run", async () => {
  process.env.JEST_WORKER_ID = "1"
  const app = Fastify()
  await app.register(installTelegram)
  try {
    const response = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      payload: { update_id: 123 },
    })
    expect(response.statusCode).toBe(404)
    expect(handleTelegramUpdate).not.toHaveBeenCalled()
  } finally {
    await app.close()
  }
})
