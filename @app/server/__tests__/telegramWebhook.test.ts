import Fastify from "fastify"

import { csrfExemptions } from "../src/externalRoutes"
import installExternalRoutes from "../src/middleware/installExternalRoutes"
import installTelegramPolling from "../src/middleware/installTelegramPolling"
import { handleTelegramUpdate } from "../src/telegram"
import { telegramWebhook } from "../src/telegramWebhook"

jest.mock("../src/telegram", () => ({
  handleTelegramUpdate: jest.fn(),
  startTelegramPolling: jest.fn(() => async () => {}),
}))

const original = {
  NODE_ENV: process.env.NODE_ENV,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_UPDATE_MODE: process.env.TELEGRAM_UPDATE_MODE,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
}
beforeEach(() => {
  jest.clearAllMocks()
  Object.assign(process.env, { NODE_ENV: "production" })
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

async function makeApp(isFeatureEnabled = async () => true) {
  const app = Fastify()
  app.decorate("rootPgPool", {} as any)
  await app.register(installExternalRoutes, {
    externalRoutes: [telegramWebhook],
    isFeatureEnabled,
  })
  return app
}

const post = (
  app: Awaited<ReturnType<typeof makeApp>>,
  payload: object,
  secret?: string
) =>
  app.inject({
    method: "POST",
    url: "/telegram/webhook",
    payload,
    headers: secret ? { "x-telegram-bot-api-secret-token": secret } : {},
  })

it.each([undefined, "wrong-secret"])(
  "rejects unauthenticated webhook requests",
  async (secret) => {
    const app = await makeApp()
    try {
      const response = await post(app, { update_id: 123 }, secret)
      expect(response.statusCode).toBe(403)
      expect(handleTelegramUpdate).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  }
)

it("passes authenticated valid updates even when the local app uses NODE_ENV=test", async () => {
  Object.assign(process.env, { NODE_ENV: "test" })
  const app = await makeApp()
  try {
    const response = await post(app, { update_id: 123 }, "test-webhook-secret")
    expect(response.statusCode).toBe(200)
    expect(handleTelegramUpdate).toHaveBeenCalledWith(app.rootPgPool, {
      update_id: 123,
    })
  } finally {
    await app.close()
  }
})

it("rejects malformed authenticated updates", async () => {
  const app = await makeApp()
  try {
    const response = await post(app, {}, "test-webhook-secret")
    expect(response.statusCode).toBe(400)
    expect(handleTelegramUpdate).not.toHaveBeenCalled()
  } finally {
    await app.close()
  }
})

describe("configuration", () => {
  it("is configured only in webhook mode with the token and the secret", () => {
    expect(telegramWebhook.configured()).toBe(true)
    expect(csrfExemptions([telegramWebhook])).toEqual([
      { method: "POST", path: "/telegram/webhook" },
    ])

    delete process.env.TELEGRAM_WEBHOOK_SECRET
    expect(telegramWebhook.configured()).toBe(false)
    process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret"

    delete process.env.TELEGRAM_BOT_TOKEN
    expect(telegramWebhook.configured()).toBe(false)
    process.env.TELEGRAM_BOT_TOKEN = "test-token"

    process.env.TELEGRAM_UPDATE_MODE = "polling"
    expect(telegramWebhook.configured()).toBe(false)
    expect(csrfExemptions([telegramWebhook])).toEqual([])

    delete process.env.TELEGRAM_UPDATE_MODE
    Object.assign(process.env, { NODE_ENV: "development" })
    expect(telegramWebhook.configured()).toBe(false)
    Object.assign(process.env, { NODE_ENV: "production" })
    expect(telegramWebhook.configured()).toBe(true)
  })

  it("does not register the webhook without its secret", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET
    const app = await makeApp()
    try {
      const response = await post(
        app,
        { update_id: 123 },
        "test-webhook-secret"
      )
      expect(response.statusCode).toBe(404)
      expect(handleTelegramUpdate).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })
})

describe("polling", () => {
  const { startTelegramPolling } = jest.requireMock("../src/telegram")
  const env = {
    IN_TESTS: process.env.IN_TESTS,
    JEST_WORKER_ID: process.env.JEST_WORKER_ID,
  }
  afterEach(() => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  async function register() {
    const app = Fastify()
    app.decorate("rootPgPool", {} as any)
    app.decorate("shutdownActions", [])
    await app.register(installTelegramPolling)
    await app.ready()
    await app.close()
  }

  it("never polls inside an automated test run", async () => {
    process.env.TELEGRAM_UPDATE_MODE = "polling"
    await register()
    expect(startTelegramPolling).not.toHaveBeenCalled()
  })

  it("polls in polling mode and not in webhook mode", async () => {
    delete process.env.IN_TESTS
    delete process.env.JEST_WORKER_ID
    await register()
    expect(startTelegramPolling).not.toHaveBeenCalled()
    process.env.TELEGRAM_UPDATE_MODE = "polling"
    await register()
    expect(startTelegramPolling).toHaveBeenCalledTimes(1)
  })
})
