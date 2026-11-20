import { telegramRequest } from "@app/lib/dist/cjs/telegram"

import { startTelegramPolling } from "../src/telegram"

jest.mock("@app/lib/dist/cjs/telegram", () => ({
  ...jest.requireActual("@app/lib/dist/cjs/telegram"),
  telegramRequest: jest.fn(),
}))

const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
function database() {
  const client = {
    query: jest.fn(async (sql: string) => ({
      rows: sql.includes("pg_try_advisory_lock")
        ? [{ acquired: true }]
        : [{ next_offset: 0 }],
    })),
    release: jest.fn(),
  }
  return { client, pool: { connect: jest.fn(async () => client) } }
}
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] })
  jest.clearAllMocks()
  jest.spyOn(console, "error").mockImplementation(() => {})
  jest.spyOn(console, "log").mockImplementation(() => {})
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})
it("retries a failed initial connection and starts polling after network recovery", async () => {
  const db = database()
  let finishPoll!: (value: unknown) => void
  jest
    .mocked(telegramRequest)
    .mockImplementation(async (method) => {
      if (method === "getUpdates")
        return new Promise((resolve) => {
          finishPoll = resolve
        }) as any
      return { url: "" } as any
    })
    .mockRejectedValueOnce(new Error("Telegram connection failed"))
  const stop = startTelegramPolling(db.pool as any)
  await flush()
  expect(telegramRequest).toHaveBeenCalledTimes(1)
  await jest.advanceTimersByTimeAsync(5000)
  await flush()
  expect(telegramRequest).toHaveBeenCalledWith(
    "getUpdates",
    expect.objectContaining({ offset: 0 })
  )
  const stopping = stop()
  finishPoll([])
  await stopping
  expect(db.client.release).toHaveBeenCalledTimes(1)
  expect(db.client.query).toHaveBeenCalledWith(
    "select pg_advisory_unlock(478433, 1)"
  )
})
it("stops promptly while waiting to retry a failed startup", async () => {
  const db = database()
  jest
    .mocked(telegramRequest)
    .mockRejectedValue(new Error("Telegram connection failed"))
  const stop = startTelegramPolling(db.pool as any)
  await flush()
  await stop()
  expect(telegramRequest).toHaveBeenCalledTimes(1)
  expect(db.client.release).toHaveBeenCalledTimes(1)
})
it("does not poll when a webhook is active", async () => {
  const db = database()
  jest
    .mocked(telegramRequest)
    .mockResolvedValue({ url: "https://example.com/telegram/webhook" })
  const stop = startTelegramPolling(db.pool as any)
  await flush()
  await stop()
  expect(telegramRequest).toHaveBeenCalledTimes(1)
  expect(db.client.release).toHaveBeenCalledTimes(1)
})
